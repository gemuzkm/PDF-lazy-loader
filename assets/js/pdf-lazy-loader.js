(function () {
    'use strict';

    const DEFAULT_I18N = {
        title: 'PDF Document',
        subtitle: 'Click the button below to load the document',
        view: 'View PDF',
        download: 'Download',
        info: 'Document will be loaded on first access',
        loading: 'Loading PDF...',
        verify: 'Please complete verification to continue',
        verifyFailed: 'Verification failed.',
        verifyExpired: 'Verification expired.',
        verifyError: 'Verification error. Refresh the page.',
        verifyLoad: 'Failed to load verification.',
        verifyServer: 'Verification could not be completed. Please try again.',
        verifyReload: 'This page is outdated. Please reload it.',
        retry: 'Try again'
    };

    const toBool = v => v === true || v === 1 || v === '1' || v === 'true';
    const toInt  = (v, d) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; };

    const getOptions = () => {
        const raw = (typeof pdfLazyLoaderData !== 'undefined' && pdfLazyLoaderData) ? pdfLazyLoaderData : {};
        return {
            version:          raw.version || '1.3.1',
            loadingTime:      Math.max(0, toInt(raw.loadingTime, 300)),
            enableDownload:   toBool(raw.enableDownload),
            enableTurnstile:  toBool(raw.enableTurnstile),
            turnstileSiteKey: raw.turnstileSiteKey || '',
            verifyUrl:        raw.verifyUrl || '',
            debugMode:        toBool(raw.debugMode),
            pdfembAssets:     (raw.pdfembAssets && typeof raw.pdfembAssets === 'object') ? raw.pdfembAssets : { css: [], js: [] },
            i18n:             Object.assign({}, DEFAULT_I18N, raw.i18n || {})
        };
    };

    const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // base64url (PDF Embedder Premium ?pdfemb-data=) and plain base64
    const b64decode = s => {
        let b = String(s).replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        return atob(b);
    };

    const SRC_INDICATORS = ['.pdf', 'application/pdf', 'pdf-embedder', 'pdfembed', 'pdfjs', 'viewer.html', 'pdf-viewer', 'pdfemb-data'];
    const CLS_INDICATORS = ['pdf-embedder', 'pdfembed', 'pdf-viewer', 'pdf-container', 'pdfemb-wrapper'];

    class PDFLazyLoader {
        constructor() {
            this.options       = getOptions();
            this.version       = this.options.version;
            this.encryptionKey = 'pdf-lazy-loader-secure-key-2024';
            this.idCounter     = 0;
            this._assetsLoaded  = false;
            this._assetsLoading = null;
            this._pending       = new Set();
            this._flushTimer    = null;

            this.debug = (...args) => { if (this.options.debugMode) console.log('[PDF]', ...args); };
            this.debug('Initializing v' + this.version, this.options);
            this.init();
        }

        // ------------------------------------------------------------------
        // XOR + Base64 obfuscation (NOT encryption — key is public)
        // ------------------------------------------------------------------
        xor(str) {
            let out = '';
            const k = this.encryptionKey;
            for (let i = 0; i < str.length; i++) out += String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length));
            return out;
        }
        encryptURL(url) { if (!url) return ''; try { return btoa(this.xor(url)); } catch (e) { return ''; } }
        decryptURL(enc) { if (!enc) return ''; try { return this.xor(atob(enc)); } catch (e) { this.debug('decryptURL error:', e); return ''; } }

        // ------------------------------------------------------------------
        // Init: event delegation (works for server-rendered and JS facades)
        // ------------------------------------------------------------------
        init() {
            document.addEventListener('click', e => {
                const btn = e.target.closest && e.target.closest('.pdf-lazy-loader-view-btn, .pdf-lazy-loader-download-btn');
                if (!btn) return;
                const wrapper = btn.closest('.pdf-lazy-loader-wrapper');
                if (!wrapper || wrapper.closest('#pdf-lazy-loader-preview')) return;
                e.preventDefault();
                if (btn.classList.contains('pdf-lazy-loader-view-btn')) this.handleViewPDF(wrapper);
                else this.handleDownloadPDF(wrapper);
            });

            // Preload on intent: static viewer assets (and Turnstile api.js)
            // start downloading on hover/focus/touch — the PDF itself is NOT
            // requested until the click (and verification).
            const onIntent = e => {
                const w = e.target.closest && e.target.closest('.pdf-lazy-loader-wrapper');
                if (!w || w.closest('#pdf-lazy-loader-preview')) return;
                this.preload();
            };
            document.addEventListener('pointerover', onIntent, { passive: true });
            document.addEventListener('focusin',     onIntent, { passive: true });
            document.addEventListener('touchstart',  onIntent, { passive: true });

            this.scan(document);
            this.setupMutationObserver();

            // Safety net: the free PDF Embedder renders <a class="pdfemb-viewer">
            // (no iframe, so no facade). Its assets were deferred by PHP — load
            // them right away so the viewer is never left broken.
            if (!document.querySelector('.pdf-lazy-loader-wrapper') && document.querySelector('.pdfemb-viewer')) {
                this.debug('No facade, free PDF Embedder viewer found — loading assets immediately');
                this.loadPDFEmbedderAssets().catch(() => {});
            }
        }

        preload() {
            if (this._preloaded) return;
            this._preloaded = true;
            this.debug('Intent detected — preloading assets');
            this.loadPDFEmbedderAssets().catch(() => {});
            if (this.options.enableTurnstile && this.options.turnstileSiteKey) this.loadTurnstileScript().catch(() => {});
        }

        // ------------------------------------------------------------------
        // Assets: early list (wp_enqueue_scripts) + late list (wp_footer / ob)
        // ------------------------------------------------------------------
        collectAssets() {
            const early = this.options.pdfembAssets || {};
            const late  = (window.pdfLazyLoaderLateAssets && typeof window.pdfLazyLoaderLateAssets === 'object') ? window.pdfLazyLoaderLateAssets : {};
            const css = new Map();
            const js  = new Map();
            [early.css, late.css].forEach(list => (Array.isArray(list) ? list : []).forEach(a => {
                const o = typeof a === 'string' ? { href: a, media: 'all', inline: '' } : a;
                if (o && o.href && !css.has(o.href)) css.set(o.href, o);
            }));
            [early.js, late.js].forEach(list => (Array.isArray(list) ? list : []).forEach(a => {
                const o = typeof a === 'string' ? { src: a, after: '' } : a;
                if (o && o.src && !js.has(o.src)) js.set(o.src, o);
            }));
            return { css: Array.from(css.values()), js: Array.from(js.values()) };
        }

        static fileOf(url) { return String(url).split('?')[0].split('#')[0].split('/').pop(); }

        loadCSS(a) {
            const file = PDFLazyLoader.fileOf(a.href);
            const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.href && l.href.includes(file));
            if (exists) return Promise.resolve();
            return new Promise(resolve => {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.media = a.media || 'all';
                link.href = a.href;
                const done = () => { clearTimeout(t); resolve(); };
                const t = setTimeout(done, 3000); // never block the viewer on a slow stylesheet
                link.onload = link.onerror = done;
                document.head.appendChild(link);
                if (a.inline) {
                    const st = document.createElement('style');
                    st.textContent = a.inline;
                    document.head.appendChild(st);
                }
                this.debug('Injected CSS:', a.href);
            });
        }

        loadJS(a) {
            const file = PDFLazyLoader.fileOf(a.src);
            const exists = Array.from(document.querySelectorAll('script[src]')).some(s => s.src && s.src.includes(file));
            if (exists) return Promise.resolve();
            return new Promise(resolve => {
                const s = document.createElement('script');
                s.src = a.src;
                s.async = false;
                s.onload = () => {
                    if (a.after) { const i = document.createElement('script'); i.textContent = a.after; document.head.appendChild(i); }
                    this.debug('JS loaded:', a.src);
                    resolve();
                };
                s.onerror = () => { this.debug('JS failed:', a.src); resolve(); };
                document.head.appendChild(s);
            });
        }

        loadPDFEmbedderAssets() {
            if (this._assetsLoaded)  return Promise.resolve();
            if (this._assetsLoading) return this._assetsLoading;

            const { css, js } = this.collectAssets();
            this.debug('Assets — CSS:', css, 'JS:', js);

            this._assetsLoading = Promise.all([
                Promise.all(css.map(a => this.loadCSS(a))),
                // JS strictly sequential (dependency order from PHP)
                js.reduce((p, a) => p.then(() => this.loadJS(a)), Promise.resolve())
            ]).then(() => {
                this._assetsLoaded  = true;
                this._assetsLoading = null;
            });
            return this._assetsLoading;
        }

        // ------------------------------------------------------------------
        // Client-side fallback for iframes that did not pass through the_content
        // ------------------------------------------------------------------
        isPDFIframe(iframe) {
            if (iframe.hasAttribute('data-pll-id')) return false;
            if (iframe.closest('.pdf-lazy-loader-wrapper, #pdf-lazy-loader-preview')) return false;

            const enc = iframe.getAttribute('data-pdf-lazy-original-src-enc');
            if (enc) return true;

            const lower = (iframe.getAttribute('src') || iframe.getAttribute('data-src') || '').toLowerCase();
            if (SRC_INDICATORS.some(ind => lower.includes(ind))) return true;

            const own = ((iframe.className || '') + ' ' + (iframe.id || '')).toLowerCase();
            const p   = iframe.parentElement;
            const par = p ? ((p.className || '') + ' ' + (p.id || '')).toLowerCase() : '';
            return lower !== '' && CLS_INDICATORS.some(c => own.includes(c) || par.includes(c));
        }

        resolvePdfUrl(src) {
            let url = src || '';
            try {
                const u = new URL(url, window.location.href);
                const data = u.searchParams.get('pdfemb-data');
                if (data) {
                    const d = JSON.parse(b64decode(data));
                    if (d && d.url) return d.url;
                }
                const file = u.searchParams.get('file') || u.searchParams.get('url') || u.searchParams.get('src');
                if (file && /\.pdf/i.test(file)) return decodeURIComponent(file);
            } catch (e) { /* keep src */ }
            return url;
        }

        facadeHTML(id, pdfUrl) {
            const t = this.options.i18n;
            const dl = this.options.enableDownload && pdfUrl;
            return '<div class="pdf-facade-wrapper pdf-lazy-loader-wrapper" data-pll-target="' + id + '"' +
                (dl ? ' data-pdf-url-enc="' + escapeHTML(this.encryptURL(pdfUrl)) + '"' : '') + '>' +
                '<div class="pdf-facade-container pdf-lazy-loader-facade"><div class="pdf-facade-content">' +
                '<div class="pdf-facade-icon" aria-hidden="true">PDF</div>' +
                '<div class="pdf-facade-title">' + escapeHTML(t.title) + '</div>' +
                '<p class="pdf-facade-subtitle">' + escapeHTML(t.subtitle) + '</p>' +
                '<div class="pdf-facade-buttons">' +
                '<button type="button" class="pdf-view-button pdf-lazy-loader-view-btn"><span class="pdf-btn-icon" aria-hidden="true">\uD83D\uDCD6</span>' + escapeHTML(t.view) + '</button>' +
                (dl ? '<button type="button" class="pdf-download-button pdf-lazy-loader-download-btn"><span class="pdf-btn-icon" aria-hidden="true">\u2B07\uFE0F</span>' + escapeHTML(t.download) + '</button>' : '') +
                '</div><p class="pdf-facade-info">' + escapeHTML(t.info) + '</p></div></div></div>';
        }

        processIframe(iframe) {
            let src = '';
            const enc = iframe.getAttribute('data-pdf-lazy-original-src-enc');
            if (enc) src = this.decryptURL(enc);
            else src = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
            if (!src || !iframe.parentNode) return;

            if (!enc) iframe.setAttribute('data-pdf-lazy-original-src-enc', this.encryptURL(src));
            iframe.removeAttribute('src');
            iframe.removeAttribute('data-pdf-lazy-intercepted');

            const id = 'pll-js-' + (++this.idCounter);
            const width = iframe.offsetWidth > 10 ? iframe.offsetWidth + 'px' : '';
            iframe.setAttribute('data-pll-id', id);
            iframe.setAttribute('aria-hidden', 'true');
            iframe.setAttribute('tabindex', '-1');
            iframe.classList.add('pll-iframe-hidden');

            iframe.insertAdjacentHTML('beforebegin', this.facadeHTML(id, this.resolvePdfUrl(src)));
            const wrapper = iframe.previousElementSibling;
            if (wrapper && width) wrapper.style.maxWidth = width;
            this.debug('Facade inserted (JS fallback):', id);
        }

        scan(root) {
            const list = root.tagName === 'IFRAME' ? [root] : root.querySelectorAll ? root.querySelectorAll('iframe:not([data-pll-id])') : [];
            for (const f of list) if (this.isPDFIframe(f)) this.processIframe(f);
        }

        setupMutationObserver() {
            if (!window.MutationObserver || !document.body) return;
            const observer = new MutationObserver(mutations => {
                for (const m of mutations) {
                    for (const n of m.addedNodes) {
                        if (n.nodeType !== 1) continue;
                        if (n.tagName === 'IFRAME' || (n.getElementsByTagName && n.getElementsByTagName('iframe').length)) this._pending.add(n);
                    }
                }
                if (this._pending.size && !this._flushTimer) {
                    this._flushTimer = setTimeout(() => {
                        this._flushTimer = null;
                        const nodes = Array.from(this._pending);
                        this._pending.clear();
                        nodes.forEach(n => { if (n.isConnected) this.scan(n); });
                    }, 50);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // ------------------------------------------------------------------
        // View / load
        // ------------------------------------------------------------------
        getIframe(wrapper) {
            const id = wrapper.getAttribute('data-pll-target');
            return id ? document.querySelector('iframe[data-pll-id="' + id + '"]') : null;
        }

        showSpinner(wrapper) {
            const content = wrapper.querySelector('.pdf-facade-content');
            if (!content || content.querySelector('.pdf-loading-spinner')) return;
            wrapper._pllSpinStart = performance.now();
            content.classList.add('is-loading');
            const sp = document.createElement('div');
            sp.className = 'pdf-loading-spinner';
            sp.setAttribute('role', 'status');
            sp.innerHTML = '<div class="pdf-spinner"></div><div class="pdf-loading-text">' + escapeHTML(this.options.i18n.loading) + '</div>';
            const title = content.querySelector('.pdf-facade-title');
            if (title) title.insertAdjacentElement('afterend', sp); else content.appendChild(sp);
        }

        // ------------------------------------------------------------------
        // Server-side verification mode (verifyUrl set): the iframe carries an
        // encrypted data-pll-ref; URLs are released by the REST endpoint after
        // Cloudflare siteverify. One token resolves ALL refs on the page.
        // ------------------------------------------------------------------
        getRef(wrapper) {
            const iframe = this.getIframe(wrapper);
            return iframe ? (iframe.getAttribute('data-pll-ref') || '') : '';
        }

        isServerMode(wrapper) { return !!(this.options.verifyUrl && this.getRef(wrapper)); }

        serverResolve(token) {
            if (!this._resolved) this._resolved = {};
            const refs = Array.from(document.querySelectorAll('iframe[data-pll-ref]'))
                .map(f => f.getAttribute('data-pll-ref'))
                .filter((r, i, a) => r && !this._resolved[r] && a.indexOf(r) === i);
            const t0 = performance.now();
            return fetch(this.options.verifyUrl, {
                method: 'POST',
                credentials: 'omit',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token, refs: refs })
            }).then(r => r.json().catch(() => ({})).then(j => {
                this.debug('verify', r.status, Math.round(performance.now() - t0) + ' ms', r.headers.get('Server-Timing') || '');
                if (!r.ok || !j || !j.success) {
                    const err = new Error((j && j.message) || this.options.i18n.verifyServer);
                    err.code = (j && j.code) || ('http_' + r.status);
                    throw err;
                }
                Object.assign(this._resolved, j.urls || {});
            }));
        }

        resetTurnstile(wrapper) {
            const eid = wrapper.getAttribute('data-turnstile-widget-id');
            if (eid && typeof turnstile !== 'undefined') { try { turnstile.remove(eid); } catch (_) {} }
            wrapper.removeAttribute('data-turnstile-widget-id');
            wrapper.removeAttribute('data-turnstile-token');
            const box = wrapper.querySelector('.pdf-turnstile-container');
            if (box) box.remove();
        }

        showFacadeError(wrapper, text) {
            const content = wrapper.querySelector('.pdf-facade-content');
            if (!content) return;
            content.classList.remove('is-loading');
            const sp = content.querySelector('.pdf-loading-spinner');
            if (sp) sp.remove();
            wrapper._pllSpinStart = 0;
            const btns = content.querySelector('.pdf-facade-buttons');
            const info = content.querySelector('.pdf-facade-info');
            if (btns) btns.hidden = false;
            if (info) info.hidden = false;
            let msg = content.querySelector('.pdf-facade-error');
            if (!msg) {
                msg = document.createElement('p');
                msg.className = 'pdf-turnstile-message is-error pdf-facade-error';
                msg.setAttribute('role', 'alert');
                if (btns) btns.insertAdjacentElement('afterend', msg); else content.appendChild(msg);
            }
            msg.textContent = text;
        }

        // Ensures the URLs for this wrapper are available, then runs cb(entry)
        withServerUrls(wrapper, cb) {
            const ref = this.getRef(wrapper);
            if (this._resolved && this._resolved[ref]) { cb(this._resolved[ref]); return; }
            if (wrapper.classList.contains('is-busy')) return;
            wrapper.classList.add('is-busy');
            const old = wrapper.querySelector('.pdf-facade-error');
            if (old) old.remove();
            this.loadTurnstileScript()
                .then(() => this.initializeTurnstile(wrapper))
                .then(token => { this.showSpinner(wrapper); return this.serverResolve(token); })
                .then(() => {
                    wrapper.classList.remove('is-busy');
                    const e = this._resolved && this._resolved[ref];
                    if (!e) throw Object.assign(new Error(this.options.i18n.verifyReload), { code: 'stale_refs' });
                    cb(e);
                })
                .catch(err => {
                    wrapper.classList.remove('is-busy');
                    this.debug('server verify error:', err);
                    this.resetTurnstile(wrapper); // tokens are single-use — next click gets a fresh widget
                    if (err && err.message && /Turnstile/.test(err.message)) return; // widget already shows its message
                    this.showFacadeError(wrapper, err && err.code === 'stale_refs' ? this.options.i18n.verifyReload : ((err && err.message) || this.options.i18n.verifyServer));
                });
        }

        handleViewPDF(wrapper) {
            // Viewer JS/CSS (not the PDF itself) download in parallel with the
            // Turnstile challenge and the verify request.
            if (this.options.enableTurnstile && this.options.turnstileSiteKey) this.loadPDFEmbedderAssets().catch(() => {});
            if (this.isServerMode(wrapper)) {
                this.withServerUrls(wrapper, e => this._doLoadPDF(wrapper, e.src));
                return;
            }
            if (wrapper.classList.contains('is-busy')) return;
            if (this.options.enableTurnstile && this.options.turnstileSiteKey && !wrapper.getAttribute('data-turnstile-token')) {
                wrapper.classList.add('is-busy');
                this.loadTurnstileScript()
                    .then(() => this.initializeTurnstile(wrapper))
                    .then(() => { wrapper.classList.remove('is-busy'); this._doLoadPDF(wrapper); })
                    .catch(err => { wrapper.classList.remove('is-busy'); this.debug('Turnstile error:', err); });
                return;
            }
            this._doLoadPDF(wrapper);
        }

        _doLoadPDF(wrapper, resolvedSrc) {
            const iframe = this.getIframe(wrapper);
            if (!iframe) { this.debug('No iframe for facade'); return; }
            const src = resolvedSrc || this.decryptURL(iframe.getAttribute('data-pdf-lazy-original-src-enc') || '');
            if (!src) return;

            wrapper.classList.add('is-busy');
            this.showSpinner(wrapper);

            // Asset download and the minimum spinner time run in parallel; the
            // minimum counts from the moment the spinner appeared (server verify
            // time is already part of it).
            const shown = wrapper._pllSpinStart ? performance.now() - wrapper._pllSpinStart : 0;
            const minDelay = new Promise(r => setTimeout(r, Math.max(0, this.options.loadingTime - shown)));
            Promise.all([this.loadPDFEmbedderAssets().catch(() => {}), minDelay]).then(() => {
                wrapper.remove();
                iframe.classList.remove('pll-iframe-hidden');
                iframe.removeAttribute('aria-hidden');
                iframe.removeAttribute('tabindex');
                iframe.removeAttribute('data-pll-ref');
                iframe.src = src;
                window.dispatchEvent(new Event('resize'));
                this.debug('iframe restored:', iframe.getAttribute('data-pll-id'));
            });
        }

        triggerDownload(url) {
            if (!url) return;
            const a = document.createElement('a');
            a.href = url; a.download = ''; a.style.display = 'none';
            document.body.appendChild(a); a.click(); a.remove();
        }

        handleDownloadPDF(wrapper) {
            if (this.isServerMode(wrapper)) {
                this.withServerUrls(wrapper, e => {
                    const content = wrapper.querySelector('.pdf-facade-content');
                    const sp = content && content.querySelector('.pdf-loading-spinner');
                    if (sp) sp.remove();
                    if (content) content.classList.remove('is-loading');
                    this.triggerDownload(e.pdf);
                });
                return;
            }
            const doDownload = () => this.triggerDownload(this.decryptURL(wrapper.getAttribute('data-pdf-url-enc') || ''));
            if (this.options.enableTurnstile && this.options.turnstileSiteKey && !wrapper.getAttribute('data-turnstile-token')) {
                this.loadTurnstileScript()
                    .then(() => this.initializeTurnstile(wrapper))
                    .then(doDownload)
                    .catch(err => this.debug('Turnstile error:', err));
                return;
            }
            doDownload();
        }

        // ------------------------------------------------------------------
        // Cloudflare Turnstile (client-side widget)
        // ------------------------------------------------------------------
        loadTurnstileScript() {
            if (this._tsPromise) return this._tsPromise;
            this._tsPromise = new Promise((resolve, reject) => {
                if (typeof turnstile !== 'undefined') { resolve(); return; }
                const waitReady = () => {
                    let n = 0;
                    const t = setInterval(() => {
                        if (typeof turnstile !== 'undefined') { clearInterval(t); resolve(); }
                        else if (++n >= 100) { clearInterval(t); reject(new Error('Turnstile timeout')); }
                    }, 50);
                };
                if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) { waitReady(); return; }
                const s = document.createElement('script');
                s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
                s.async = true;
                s.onload = waitReady;
                s.onerror = () => reject(new Error('Failed to load Turnstile'));
                document.head.appendChild(s);
            });
            this._tsPromise.catch(() => { this._tsPromise = null; });
            return this._tsPromise;
        }

        initializeTurnstile(wrapper) {
            const t = this.options.i18n;
            return new Promise((resolve, reject) => {
                const content = wrapper.querySelector('.pdf-facade-content');
                if (!content) { reject(new Error('No facade content')); return; }

                const btns = content.querySelector('.pdf-facade-buttons');
                const info = content.querySelector('.pdf-facade-info');

                let box = content.querySelector('.pdf-turnstile-container');
                if (!box) {
                    box = document.createElement('div');
                    box.className = 'pdf-turnstile-container';
                    box.id = 'pdf-ts-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
                    if (btns) btns.insertAdjacentElement('afterend', box); else content.appendChild(box);
                }
                if (btns) btns.hidden = true;
                if (info) info.hidden = true;

                let msg = box.querySelector('.pdf-turnstile-message');
                if (!msg) {
                    msg = document.createElement('p');
                    msg.className = 'pdf-turnstile-message';
                    box.prepend(msg);
                }
                msg.textContent = t.verify;
                msg.classList.remove('is-error');
                const fail = text => { msg.textContent = text; msg.classList.add('is-error'); };

                // Widget is removed through the Turnstile API (not just DOM removal),
                // otherwise api.js keeps polling it: "Cannot find Widget …".
                const restore = () => {
                    box.hidden = true;
                    if (btns) btns.hidden = false;
                    if (info) info.hidden = false;
                    const wid = wrapper.getAttribute('data-turnstile-widget-id');
                    wrapper.removeAttribute('data-turnstile-widget-id');
                    setTimeout(() => {
                        if (wid && typeof turnstile !== 'undefined') { try { turnstile.remove(wid); } catch (_) {} }
                        box.remove();
                    }, 0);
                };

                const eid = wrapper.getAttribute('data-turnstile-widget-id');
                if (eid) {
                    try { const tok = turnstile.getResponse(eid); if (tok) { wrapper.setAttribute('data-turnstile-token', tok); restore(); resolve(tok); return; } }
                    catch (_) { wrapper.removeAttribute('data-turnstile-widget-id'); }
                }

                // Retry after error/expiry: drop the stale widget before rendering a new one
                if (eid) { try { turnstile.remove(eid); } catch (_) {} wrapper.removeAttribute('data-turnstile-widget-id'); }
                box.querySelectorAll('.pdf-turnstile-slot').forEach(n => n.remove());

                const slot = document.createElement('div');
                slot.className = 'pdf-turnstile-slot';
                box.appendChild(slot);
                try {
                    const wid = turnstile.render(slot, {
                        sitekey: this.options.turnstileSiteKey, theme: 'light', size: 'normal', action: 'pdf_view',
                        callback: token => { wrapper.setAttribute('data-turnstile-token', token); restore(); resolve(token); },
                        'error-callback':   () => { wrapper.removeAttribute('data-turnstile-token'); fail(t.verifyFailed);  reject(new Error('Turnstile failed')); },
                        'expired-callback': () => { wrapper.removeAttribute('data-turnstile-token'); fail(t.verifyExpired); reject(new Error('Turnstile expired')); }
                    });
                    if (wid) wrapper.setAttribute('data-turnstile-widget-id', wid);
                } catch (e) {
                    fail(t.verifyError);
                    reject(e);
                }
            });
        }
    }

    const start = () => { window.PDFLazyLoader = new PDFLazyLoader(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
