(function() {
    'use strict';

    const getOptions = () => {
        if (typeof pdfLazyLoaderData !== 'undefined' && pdfLazyLoaderData) {
            const options = { ...pdfLazyLoaderData };
            if (typeof options.enableDownload === 'string')      options.enableDownload      = options.enableDownload === '1' || options.enableDownload === 'true';
            if (typeof options.loadingTime === 'string')         options.loadingTime         = parseInt(options.loadingTime, 10) || 1500;
            if (typeof options.facadeHeightDesktop === 'string') options.facadeHeightDesktop = parseInt(options.facadeHeightDesktop, 10) || 600;
            if (typeof options.facadeHeightTablet === 'string')  options.facadeHeightTablet  = parseInt(options.facadeHeightTablet, 10) || 500;
            if (typeof options.facadeHeightMobile === 'string')  options.facadeHeightMobile  = parseInt(options.facadeHeightMobile, 10) || 400;
            if (typeof options.enableTurnstile === 'string')     options.enableTurnstile     = options.enableTurnstile === '1' || options.enableTurnstile === 'true';
            if (typeof options.debugMode === 'string')           options.debugMode           = options.debugMode === '1' || options.debugMode === 'true';
            return options;
        }
        return {
            buttonColor: '#FF6B6B', buttonColorHover: '#E63946',
            loadingTime: 1500, enableDownload: false,
            facadeHeightDesktop: 600, facadeHeightTablet: 500, facadeHeightMobile: 400,
            enableTurnstile: false, turnstileSiteKey: '', debugMode: false,
            pdfembAssets: { css: [], js: [] }
        };
    };

    class PDFLazyLoader {
        constructor() {
            this.options = getOptions();
            this.version = '1.1.0';
            this.processedIframes    = new WeakSet();
            this.encryptionKey       = 'pdf-lazy-loader-secure-key-2024';
            this._pdfembAssetsLoaded  = false;
            this._pdfembAssetsLoading = null;

            this.debug = (...args) => { if (this.options.debugMode) console.log('[PDF]', ...args); };
            this.debug('Initializing v' + this.version);
            this.debug('Options:', this.options);
            this.init();
        }

        encryptURL(url) {
            if (!url) return '';
            try {
                let out = '';
                for (let i = 0; i < url.length; i++) {
                    out += String.fromCharCode(url.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length));
                }
                return btoa(out);
            } catch(e) { return ''; }
        }

        decryptURL(enc) {
            if (!enc) return '';
            try {
                const decoded = atob(enc);
                let out = '';
                for (let i = 0; i < decoded.length; i++) {
                    out += String.fromCharCode(decoded.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length));
                }
                this.debug('decryptURL ok, length:', out.length);
                return out;
            } catch(e) { this.debug('decryptURL error:', e); return ''; }
        }

        // -----------------------------------------------------------------------
        // Asset loader — three sources merged:
        //   A) pdfLazyLoaderData.pdfembAssets   — wp_enqueue_scripts dequeue list
        //   B) window.pdfLazyLoaderLateAssets   — wp_footer scan list (injected
        //      by PHP pdf_lazy_loader_inject_assets_to_footer at wp_footer:2,
        //      or updated by ob_start callback before </body>)
        //
        // CSS dedup: simple filename includes() — avoids CSS.escape() breaking
        //   querySelector for filenames containing dots (e.g. pdfemb-fullscreen.min.css)
        // JS dedup: same approach
        // -----------------------------------------------------------------------
        loadPDFEmbedderAssets() {
            if (this._pdfembAssetsLoaded)  return Promise.resolve();
            if (this._pdfembAssetsLoading) return this._pdfembAssetsLoading;

            const mergeUnique = (a, b) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]));

            // Re-read window.pdfLazyLoaderLateAssets at click time (ob_start may
            // have updated it after DOMContentLoaded)
            const early = (this.options.pdfembAssets && typeof this.options.pdfembAssets === 'object')
                ? this.options.pdfembAssets : { css: [], js: [] };
            const late  = (window.pdfLazyLoaderLateAssets && typeof window.pdfLazyLoaderLateAssets === 'object')
                ? window.pdfLazyLoaderLateAssets : { css: [], js: [] };

            const cssUrls = mergeUnique(early.css, late.css);
            const jsUrls  = mergeUnique(early.js,  late.js);

            this.debug('loadPDFEmbedderAssets — early CSS:', early.css);
            this.debug('loadPDFEmbedderAssets — late  CSS:', late.css);
            this.debug('loadPDFEmbedderAssets — early JS: ', early.js);
            this.debug('loadPDFEmbedderAssets — late  JS: ', late.js);
            this.debug('loadPDFEmbedderAssets — merged CSS:', cssUrls, 'JS:', jsUrls);

            if (cssUrls.length === 0 && jsUrls.length === 0) {
                this._pdfembAssetsLoaded = true;
                return Promise.resolve();
            }

            this._pdfembAssetsLoading = new Promise((resolve) => {

                // --- CSS: inject all, dedup by filename (handles dots correctly) ---
                cssUrls.forEach(href => {
                    if (!href) return;
                    const filename = href.split('?')[0].split('/').pop();
                    // Check if already present using simple string match (no CSS.escape)
                    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                        .some(l => l.href && l.href.includes(filename));
                    if (existing) { this.debug('CSS already present, skip:', filename); return; }
                    const link  = document.createElement('link');
                    link.rel   = 'stylesheet';
                    link.media = 'all';
                    link.href  = href;
                    document.head.appendChild(link);
                    this.debug('Injected CSS:', href);
                });

                // --- JS: inject sequentially, dedup by filename ---
                const loadScript = (urls, idx) => {
                    if (idx >= urls.length) {
                        this._pdfembAssetsLoaded  = true;
                        this._pdfembAssetsLoading = null;
                        this.debug('All JS loaded');
                        resolve();
                        return;
                    }
                    const src = urls[idx];
                    if (!src) { loadScript(urls, idx + 1); return; }
                    const filename = src.split('?')[0].split('/').pop();
                    const existing = Array.from(document.querySelectorAll('script[src]'))
                        .some(s => s.src && s.src.includes(filename));
                    if (existing) {
                        this.debug('JS already present, skip:', filename);
                        loadScript(urls, idx + 1);
                        return;
                    }
                    const script   = document.createElement('script');
                    script.src     = src;
                    script.async   = false;
                    script.onload  = () => { this.debug('JS loaded:', src);  loadScript(urls, idx + 1); };
                    script.onerror = () => { this.debug('JS failed:', src);  loadScript(urls, idx + 1); };
                    document.head.appendChild(script);
                };

                loadScript(jsUrls, 0);
            });

            return this._pdfembAssetsLoading;
        }

        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => { this.processPDFs(); this.setupMutationObserver(); });
            } else {
                this.processPDFs();
                this.setupMutationObserver();
            }
        }

        isPDFIframe(iframe) {
            if (iframe.parentElement &&
                (iframe.parentElement.querySelector('.pdf-lazy-loader-wrapper') ||
                 iframe.nextElementSibling?.classList?.contains('pdf-lazy-loader-wrapper'))) return false;

            const src     = iframe.getAttribute('src')      || '';
            const dataSrc = iframe.getAttribute('data-src') || '';
            const cls     = (iframe.className || '').toLowerCase();
            const id      = (iframe.id        || '').toLowerCase();

            const srcInds = ['.pdf','application/pdf','pdf-embedder','pdfembed','pdfjs','viewer.html','pdf-viewer','pdfemb-data'];
            const lower   = (src || dataSrc).toLowerCase();
            for (const ind of srcInds) { if (lower.includes(ind)) return true; }

            const clsInds = ['pdf-embedder','pdfembed','pdf-viewer','pdf-container','pdfemb-wrapper'];
            for (const c of clsInds) { if (cls.includes(c) || id.includes(c)) return true; }

            const parent = iframe.parentElement;
            if (parent) {
                const pc = (parent.className || '').toLowerCase();
                const pi = (parent.id        || '').toLowerCase();
                for (const c of clsInds) { if (pc.includes(c) || pi.includes(c)) return true; }
            }
            return false;
        }

        extractPDFUrl(iframe) {
            let url = '';
            const enc = iframe.getAttribute('data-pdf-lazy-original-src-enc');
            if (enc) {
                url = this.decryptURL(enc);
            } else {
                url = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
            }

            if (url.includes('pdfemb-data')) {
                try {
                    const u    = new URL(url, window.location.href);
                    const data = u.searchParams.get('pdfemb-data');
                    if (data) { const d = JSON.parse(atob(data)); if (d.url) url = d.url; }
                } catch(e) {}
            }
            if (url.includes('viewer.html') || url.includes('pdfjs')) {
                try {
                    const u    = new URL(url, window.location.href);
                    const file = u.searchParams.get('file') || u.searchParams.get('url') || u.searchParams.get('src');
                    if (file) url = decodeURIComponent(file);
                } catch(e) {}
            }
            if (!url || url.includes('pdfemb-data')) {
                url = iframe.getAttribute('data-pdf-url') || iframe.getAttribute('data-url') || iframe.getAttribute('data-pdfemb-url') || '';
            }
            return url;
        }

        processPDFs() {
            this.debug('processPDFs: scanning...');
            document.querySelectorAll('iframe').forEach(iframe => {
                if (!this.processedIframes.has(iframe) && this.isPDFIframe(iframe)) {
                    this.processIframe(iframe);
                }
            });
        }

        setupMutationObserver() {
            const observer = new MutationObserver(mutations => {
                let hit = false;
                mutations.forEach(m => m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.tagName === 'IFRAME' || (node.querySelectorAll && node.querySelectorAll('iframe').length)) hit = true;
                }));
                if (hit) setTimeout(() => this.processPDFs(), 100);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        processIframe(iframe) {
            this.processedIframes.add(iframe);

            let originalSrc = '';
            const enc = iframe.getAttribute('data-pdf-lazy-original-src-enc');
            if (enc) {
                originalSrc = this.decryptURL(enc);
                if (originalSrc) iframe.setAttribute('data-pdf-lazy-original-src-enc', this.encryptURL(originalSrc));
            } else {
                originalSrc = iframe.getAttribute('src') || '';
            }
            iframe.removeAttribute('data-pdf-lazy-intercepted');

            const cs = window.getComputedStyle(iframe);
            let width  = iframe.offsetWidth  > 10 ? iframe.offsetWidth  + 'px' : (cs.width  || '');
            let height = iframe.offsetHeight > 10 ? iframe.offsetHeight + 'px' : (cs.height || '');
            if (!width  || width  === 'auto' || width  === '0px' || width  === '1px') {
                const pw = iframe.parentElement ? iframe.parentElement.offsetWidth : 0;
                width = pw > 0 ? pw + 'px' : '100%';
            }
            if (!height || height === 'auto' || height === '0px' || height === '1px') height = '600px';
            const addPx = v => (!v.includes('%') && !v.includes('px') && !v.includes('em') && !v.includes('rem')) ? (parseFloat(v)||0)+'px' : v;
            width  = addPx(width);
            height = addPx(height);

            const pdfUrl      = this.extractPDFUrl(iframe);
            const finalPdfUrl = (pdfUrl && pdfUrl !== originalSrc && !pdfUrl.includes('pdfemb-data')) ? pdfUrl : originalSrc;
            if (!finalPdfUrl) return;

            iframe.removeAttribute('src');
            Object.assign(iframe.style, {
                display:'none', visibility:'hidden', position:'absolute',
                left:'-9999px', top:'-9999px', width:'1px', height:'1px',
                opacity:'0', pointerEvents:'none', zIndex:'-1'
            });
            iframe.setAttribute('aria-hidden', 'true');
            iframe.setAttribute('tabindex', '-1');

            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-facade-wrapper pdf-lazy-loader-wrapper';
            wrapper.setAttribute('data-pdf-url-enc',      this.encryptURL(finalPdfUrl));
            wrapper.setAttribute('data-original-src-enc', this.encryptURL(originalSrc));
            wrapper.setAttribute('data-iframe-width',  width);
            wrapper.setAttribute('data-iframe-height', height);
            wrapper.style.cssText = `width:${width};margin:0 auto 20px;position:relative;display:block;`;

            const getFacadeH = () => {
                const w = window.innerWidth;
                if (w >= 1024) return (this.options.facadeHeightDesktop || 600) + 'px';
                if (w >= 768)  return (this.options.facadeHeightTablet  || 500) + 'px';
                return (this.options.facadeHeightMobile || 400) + 'px';
            };

            const facade = document.createElement('div');
            facade.className = 'pdf-facade-container pdf-lazy-loader-facade';
            facade.style.cssText = `width:100%;height:${getFacadeH()};min-height:${getFacadeH()};border-radius:8px;background:linear-gradient(to bottom,#f8f9fa 0%,#e9ecef 50%,#f8f9fa 100%);padding:40px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-sizing:border-box;`;
            window.addEventListener('resize', () => { const h = getFacadeH(); facade.style.height = h; facade.style.minHeight = h; });

            const icon = document.createElement('div');
            icon.style.cssText = `width:80px;height:80px;background:${this.options.buttonColor};border-radius:8px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 4px 12px rgba(0,0,0,.15);`;
            icon.innerHTML = '<span style="color:#fff;font-size:32px;font-weight:700;font-family:sans-serif;">PDF</span>';

            const title    = document.createElement('h3');
            title.style.cssText = 'margin:0 0 10px;color:#333;font-size:20px;font-weight:600;text-align:center;';
            title.textContent   = 'PDF Document';

            const subtitle = document.createElement('p');
            subtitle.className  = 'pdf-facade-subtitle';
            subtitle.style.cssText = 'margin:0 0 20px;color:#666;font-size:14px;text-align:center;';
            subtitle.textContent   = 'Click the button below to load the document';

            const btns = document.createElement('div');
            btns.className  = 'pdf-facade-buttons';
            btns.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';

            const viewBtn = document.createElement('button');
            viewBtn.type      = 'button';
            viewBtn.className = 'pdf-view-button pdf-lazy-loader-view-btn';
            viewBtn.innerHTML = '<span style="margin-right:8px">\uD83D\uDCD6</span>View PDF';
            viewBtn.style.cssText = `padding:12px 24px;background:${this.options.buttonColor};color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;transition:all .3s;display:inline-flex;align-items:center;box-shadow:0 2px 4px rgba(0,0,0,.1);`;
            viewBtn.addEventListener('mouseenter', () => { viewBtn.style.background = this.options.buttonColorHover; viewBtn.style.transform = 'translateY(-2px)'; });
            viewBtn.addEventListener('mouseleave', () => { viewBtn.style.background = this.options.buttonColor;      viewBtn.style.transform = 'translateY(0)'; });
            viewBtn.addEventListener('click', () => this.handleViewPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc));
            btns.appendChild(viewBtn);

            if (this.options.enableDownload) {
                const dlBtn = document.createElement('button');
                dlBtn.type      = 'button';
                dlBtn.className = 'pdf-download-button pdf-lazy-loader-download-btn';
                dlBtn.innerHTML = '<span style="margin-right:8px">\u2B07\uFE0F</span>Download';
                dlBtn.setAttribute('data-pdf-url-enc', this.encryptURL(finalPdfUrl));
                dlBtn.style.cssText = 'padding:12px 24px;background:#fff;color:#333;border:2px solid #ddd;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;transition:all .3s;display:inline-flex;align-items:center;box-shadow:0 2px 4px rgba(0,0,0,.1);';
                dlBtn.addEventListener('mouseenter', () => { dlBtn.style.background = '#f5f5f5'; dlBtn.style.borderColor = '#bbb'; });
                dlBtn.addEventListener('mouseleave', () => { dlBtn.style.background = '#fff';    dlBtn.style.borderColor = '#ddd'; });
                dlBtn.addEventListener('click', e => { e.preventDefault(); this.handleDownloadPDF(dlBtn); });
                btns.appendChild(dlBtn);
            }

            const info = document.createElement('p');
            info.className  = 'pdf-facade-info';
            info.style.cssText = 'margin:20px 0 0;color:#999;font-size:13px;text-align:center;';
            info.textContent   = 'Document will be loaded on first access';

            const content = document.createElement('div');
            content.className  = 'pdf-facade-content';
            content.style.cssText = 'position:relative;z-index:1;text-align:center;padding:40px 20px;display:flex;flex-direction:column;align-items:center;width:100%;';
            content.append(icon, title, subtitle, btns, info);
            facade.appendChild(content);
            wrapper.appendChild(facade);

            if (!iframe.parentNode) return;
            iframe.parentNode.insertBefore(wrapper, iframe);
            this.debug('Facade inserted');
        }

        loadPDF(iframe, facade, pdfUrl, originalSrc, wrapper) {
            this.debug('loadPDF url:', pdfUrl);
            if (!pdfUrl && !originalSrc) return;
            originalSrc = originalSrc || pdfUrl;
            pdfUrl      = pdfUrl      || originalSrc;

            const btns     = facade.querySelector('.pdf-facade-buttons');
            const subtitle = facade.querySelector('.pdf-facade-subtitle');
            const info     = facade.querySelector('.pdf-facade-info');
            if (btns)     btns.style.display     = 'none';
            if (subtitle) subtitle.style.display = 'none';
            if (info)     info.style.display     = 'none';

            const spinner = document.createElement('div');
            spinner.className  = 'pdf-loading-spinner';
            spinner.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px;';
            spinner.innerHTML  = `<div class="pdf-spinner" style="width:40px;height:40px;border:3px solid rgba(0,0,0,.08);border-top-color:${this.options.buttonColor};border-radius:50%;animation:pdf-spin .8s linear infinite;"></div><div style="color:#666;font-size:13px;">Loading PDF...</div>`;
            const cEl = facade.querySelector('.pdf-facade-content');
            const tEl = cEl ? cEl.querySelector('h3') : null;
            if (tEl) tEl.insertAdjacentElement('afterend', spinner);
            else if (cEl) cEl.appendChild(spinner);
            else facade.appendChild(spinner);

            setTimeout(() => {
                facade.querySelector('.pdf-loading-spinner')?.remove();
                if (!wrapper) wrapper = facade.closest('.pdf-facade-wrapper');
                const sw = wrapper ? wrapper.getAttribute('data-iframe-width')  : '';
                const sh = wrapper ? wrapper.getAttribute('data-iframe-height') : '';
                const src = originalSrc || pdfUrl;
                if (!src) return;

                iframe.setAttribute('src', src);
                iframe.src = src;

                if (wrapper) {
                    const parent = wrapper.parentNode;
                    const next   = wrapper.nextSibling;
                    wrapper.remove();
                    if (parent) { if (next) parent.insertBefore(iframe, next); else parent.appendChild(iframe); }
                } else {
                    facade.remove();
                }

                ['display','visibility','position','opacity','left','top','pointerEvents','zIndex','width','height']
                    .forEach(p => { iframe.style[p] = ''; });
                if (sw) iframe.style.width  = sw;
                if (sh) iframe.style.height = sh;
                iframe.removeAttribute('aria-hidden');
                iframe.removeAttribute('tabindex');
                iframe.offsetHeight;
                window.dispatchEvent(new Event('resize'));
                this.debug('iframe restored');
            }, this.options.loadingTime);
        }

        loadTurnstileScript() {
            return new Promise((resolve, reject) => {
                if (typeof turnstile !== 'undefined') { resolve(); return; }
                if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
                    let n = 0;
                    const t = setInterval(() => {
                        if (typeof turnstile !== 'undefined') { clearInterval(t); resolve(); }
                        else if (++n >= 50) { clearInterval(t); reject(new Error('Turnstile timeout')); }
                    }, 100);
                    return;
                }
                const s = document.createElement('script');
                s.src     = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
                s.async   = true;
                s.defer   = true;
                s.onload  = () => resolve();
                s.onerror = () => reject(new Error('Failed to load Turnstile'));
                document.head.appendChild(s);
            });
        }

        initializeTurnstile(wrapper, facade) {
            return new Promise((resolve, reject) => {
                const content = facade.querySelector('.pdf-facade-content');
                if (!content) { reject(new Error('No facade content')); return; }

                let cid = wrapper.getAttribute('data-turnstile-container-id');
                let box = cid ? document.getElementById(cid) : null;
                if (!box) {
                    box = document.createElement('div');
                    box.className = 'pdf-turnstile-container';
                    cid = 'pdf-ts-' + Date.now() + '-' + Math.random().toString(36).substr(2,9);
                    box.id = cid;
                    box.style.cssText = 'margin:20px 0;display:flex;flex-direction:column;align-items:center;min-height:65px;';
                    const b = content.querySelector('.pdf-facade-buttons');
                    if (b && b.nextSibling) content.insertBefore(box, b.nextSibling); else content.appendChild(box);
                    wrapper.setAttribute('data-turnstile-container-id', cid);
                }

                const btns = facade.querySelector('.pdf-facade-buttons');
                const info = facade.querySelector('.pdf-facade-info');
                if (btns) btns.style.display = 'none';
                if (info) info.style.display = 'none';

                let msg = box.querySelector('.pdf-turnstile-message');
                if (!msg) {
                    msg = document.createElement('p');
                    msg.className = 'pdf-turnstile-message';
                    msg.style.cssText = 'margin:0 0 15px;color:#666;font-size:14px;text-align:center;';
                    msg.textContent = 'Please complete verification to continue';
                    box.insertBefore(msg, box.firstChild);
                }

                let attempts = 0;
                const tryRender = () => {
                    if (typeof turnstile === 'undefined') {
                        if (++attempts < 50) { setTimeout(tryRender, 100); return; }
                        if (msg) { msg.textContent = 'Failed to load verification.'; msg.style.color = '#e63946'; }
                        reject(new Error('Turnstile unavailable')); return;
                    }
                    const eid = wrapper.getAttribute('data-turnstile-widget-id');
                    if (eid) {
                        try { const t = turnstile.getResponse(eid); if (t) { resolve(t); return; } }
                        catch(_) { wrapper.removeAttribute('data-turnstile-widget-id'); }
                    }
                    try {
                        const wid = turnstile.render('#' + cid, {
                            sitekey: this.options.turnstileSiteKey, theme: 'light', size: 'normal',
                            callback: token => {
                                wrapper.setAttribute('data-turnstile-token', token);
                                if (msg) msg.remove();
                                box.remove();
                                wrapper.removeAttribute('data-turnstile-container-id');
                                if (btns) btns.style.display = '';
                                if (info) info.style.display = '';
                                resolve(token);
                            },
                            'error-callback':   () => { wrapper.removeAttribute('data-turnstile-token'); if (msg) { msg.textContent = 'Verification failed.'; msg.style.color='#e63946'; } reject(new Error('Turnstile failed')); },
                            'expired-callback': () => { wrapper.removeAttribute('data-turnstile-token'); if (msg) { msg.textContent = 'Verification expired.'; msg.style.color='#e63946'; } reject(new Error('Turnstile expired')); },
                        });
                        if (wid) wrapper.setAttribute('data-turnstile-widget-id', wid);
                    } catch(e) {
                        if (msg) { msg.textContent = 'Verification error. Refresh.'; msg.style.color='#e63946'; }
                        reject(e);
                    }
                };
                setTimeout(tryRender, 100);
            });
        }

        handleViewPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc) {
            if (this.options.enableTurnstile && this.options.turnstileSiteKey) {
                if (!wrapper.getAttribute('data-turnstile-token')) {
                    this.loadTurnstileScript()
                        .then(() => this.initializeTurnstile(wrapper, facade))
                        .then(() => this._doLoadPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc))
                        .catch(err => this.debug('Turnstile error:', err));
                    return;
                }
            }
            this._doLoadPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc);
        }

        _doLoadPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc) {
            const encPdf = wrapper.getAttribute('data-pdf-url-enc');
            const encSrc = wrapper.getAttribute('data-original-src-enc');
            const pdfUrl = (encPdf ? this.decryptURL(encPdf) : null) || finalPdfUrl;
            const srcUrl = (encSrc ? this.decryptURL(encSrc) : null) || originalSrc;

            this.loadPDFEmbedderAssets()
                .then(() => this.loadPDF(iframe, facade, pdfUrl, srcUrl, wrapper));
        }

        handleDownloadPDF(dlBtn) {
            const wrapper = dlBtn.closest('.pdf-facade-wrapper');
            if (!wrapper) return;
            const facade = wrapper.querySelector('.pdf-facade-container');
            if (!facade)  return;

            const doDownload = () => {
                const url = this.decryptURL(dlBtn.getAttribute('data-pdf-url-enc') || '');
                if (!url) return;
                const a = document.createElement('a');
                a.href = url; a.download = ''; a.style.display = 'none';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            };

            if (this.options.enableTurnstile && this.options.turnstileSiteKey) {
                if (wrapper.getAttribute('data-turnstile-token')) { doDownload(); return; }
                this.loadTurnstileScript()
                    .then(() => this.initializeTurnstile(wrapper, facade))
                    .then(() => doDownload())
                    .catch(err => this.debug('Turnstile error:', err));
                return;
            }
            doDownload();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { window.PDFLazyLoader = new PDFLazyLoader(); });
    } else {
        window.PDFLazyLoader = new PDFLazyLoader();
    }
})();
