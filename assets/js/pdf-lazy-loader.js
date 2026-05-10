(function() {
    'use strict';

    const getOptions = () => {
        if (typeof pdfLazyLoaderData !== 'undefined' && pdfLazyLoaderData) {
            const options = { ...pdfLazyLoaderData };
            if (typeof options.enableDownload === 'string') {
                options.enableDownload = options.enableDownload === '1' || options.enableDownload === 'true';
            }
            if (typeof options.loadingTime === 'string') {
                options.loadingTime = parseInt(options.loadingTime, 10) || 1500;
            }
            if (typeof options.facadeHeightDesktop === 'string') {
                options.facadeHeightDesktop = parseInt(options.facadeHeightDesktop, 10) || 600;
            }
            if (typeof options.facadeHeightTablet === 'string') {
                options.facadeHeightTablet = parseInt(options.facadeHeightTablet, 10) || 500;
            }
            if (typeof options.facadeHeightMobile === 'string') {
                options.facadeHeightMobile = parseInt(options.facadeHeightMobile, 10) || 400;
            }
            if (typeof options.enableTurnstile === 'string') {
                options.enableTurnstile = options.enableTurnstile === '1' || options.enableTurnstile === 'true';
            }
            if (typeof options.debugMode === 'string') {
                options.debugMode = options.debugMode === '1' || options.debugMode === 'true';
            }
            return options;
        }
        return {
            buttonColor: '#FF6B6B',
            buttonColorHover: '#E63946',
            loadingTime: 1500,
            enableDownload: false,
            facadeHeightDesktop: 600,
            facadeHeightTablet: 500,
            facadeHeightMobile: 400,
            enableTurnstile: false,
            turnstileSiteKey: '',
            debugMode: false,
            pdfembAssets: { css: [], js: [] }
        };
    };

    class PDFLazyLoader {
        constructor() {
            this.options = getOptions();
            this.version = '1.0.8';
            this.processedIframes = new WeakSet();
            this.encryptionKey = 'pdf-lazy-loader-secure-key-2024';
            this._pdfembAssetsLoaded = false;
            this._pdfembAssetsLoading = null; // Promise, prevents double injection

            this.debug = (...args) => {
                if (this.options.debugMode) {
                    console.log('[PDF]', ...args);
                }
            };

            this.debug('Initializing v' + this.version);
            this.debug('Options:', this.options);
            this.init();
        }

        // XOR + Base64 — must match pdf_lazy_loader_encrypt_url() in PHP and the inline head script
        encryptURL(url) {
            if (!url) return '';
            try {
                let encrypted = '';
                for (let i = 0; i < url.length; i++) {
                    const keyChar = this.encryptionKey[i % this.encryptionKey.length];
                    encrypted += String.fromCharCode(url.charCodeAt(i) ^ keyChar.charCodeAt(0));
                }
                return btoa(encrypted);
            } catch (e) {
                if (this.options.debugMode) console.error('[PDF] Encryption error:', e);
                return '';
            }
        }

        decryptURL(encrypted) {
            if (!encrypted) return '';
            try {
                const decoded = atob(encrypted);
                let decrypted = '';
                for (let i = 0; i < decoded.length; i++) {
                    const keyChar = this.encryptionKey[i % this.encryptionKey.length];
                    decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ keyChar.charCodeAt(0));
                }
                this.debug('decryptURL: ok, length:', decrypted.length);
                return decrypted;
            } catch (e) {
                this.debug('decryptURL error:', e);
                return '';
            }
        }

        // -----------------------------------------------------------------------
        // On-demand PDF Embedder asset loader
        // Injects dequeued CSS + JS only when the user clicks "View PDF".
        // All subsequent clicks reuse the same Promise (assets loaded once).
        // -----------------------------------------------------------------------
        loadPDFEmbedderAssets() {
            if (this._pdfembAssetsLoaded) {
                return Promise.resolve();
            }
            if (this._pdfembAssetsLoading) {
                return this._pdfembAssetsLoading;
            }

            const assets = (this.options.pdfembAssets) || { css: [], js: [] };
            const cssUrls = Array.isArray(assets.css) ? assets.css : [];
            const jsUrls  = Array.isArray(assets.js)  ? assets.js  : [];

            if (cssUrls.length === 0 && jsUrls.length === 0) {
                this._pdfembAssetsLoaded = true;
                return Promise.resolve();
            }

            this.debug('loadPDFEmbedderAssets: injecting', cssUrls.length, 'CSS,', jsUrls.length, 'JS');

            this._pdfembAssetsLoading = new Promise((resolve) => {
                // 1. Inject all CSS (non-blocking)
                cssUrls.forEach(href => {
                    if (!href || document.querySelector('link[href*="' + CSS.escape(href.split('?')[0].split('/').pop()) + '"]')) return;
                    const link = document.createElement('link');
                    link.rel  = 'stylesheet';
                    link.type = 'text/css';
                    link.href = href;
                    document.head.appendChild(link);
                    this.debug('loadPDFEmbedderAssets: injected CSS', href);
                });

                // 2. Inject JS sequentially (order matters for PDF.js worker → viewer)
                const loadScript = (urls, index) => {
                    if (index >= urls.length) {
                        this._pdfembAssetsLoaded = true;
                        this._pdfembAssetsLoading = null;
                        this.debug('loadPDFEmbedderAssets: all JS loaded');
                        resolve();
                        return;
                    }
                    const src = urls[index];
                    // Skip if already loaded
                    if (!src || document.querySelector('script[src*="' + src.split('?')[0].split('/').pop() + '"]')) {
                        this.debug('loadPDFEmbedderAssets: JS already present, skipping', src);
                        loadScript(urls, index + 1);
                        return;
                    }
                    const script   = document.createElement('script');
                    script.src     = src;
                    script.async   = false; // preserve load order
                    script.onload  = () => { this.debug('loadPDFEmbedderAssets: JS loaded', src); loadScript(urls, index + 1); };
                    script.onerror = () => { this.debug('loadPDFEmbedderAssets: JS failed', src); loadScript(urls, index + 1); };
                    document.head.appendChild(script);
                };

                loadScript(jsUrls, 0);
            });

            return this._pdfembAssetsLoading;
        }

        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.processPDFs();
                    this.setupMutationObserver();
                });
            } else {
                this.processPDFs();
                this.setupMutationObserver();
            }
        }

        isPDFIframe(iframe) {
            if (
                iframe.parentElement &&
                (iframe.parentElement.querySelector('.pdf-lazy-loader-wrapper') ||
                 iframe.nextElementSibling?.classList?.contains('pdf-lazy-loader-wrapper'))
            ) {
                return false;
            }

            const src       = iframe.getAttribute('src')      || '';
            const dataSrc   = iframe.getAttribute('data-src') || '';
            const className = iframe.className || '';
            const id        = iframe.id || '';

            const indicators = [
                '.pdf', 'application/pdf', 'pdf-embedder', 'pdfembed',
                'pdfjs', 'viewer.html', 'pdf-viewer', 'pdfemb-data'
            ];

            const lowerSrc = (src || dataSrc).toLowerCase();
            for (const ind of indicators) {
                if (lowerSrc.includes(ind)) return true;
            }

            const pdfClasses = ['pdf-embedder','pdfembed','pdf-viewer','pdf-container','pdfemb-wrapper'];
            for (const cls of pdfClasses) {
                if (className.toLowerCase().includes(cls) || id.toLowerCase().includes(cls)) return true;
            }

            const parent = iframe.parentElement;
            if (parent) {
                const pc = (parent.className || '').toLowerCase();
                const pi = (parent.id || '').toLowerCase();
                for (const cls of pdfClasses) {
                    if (pc.includes(cls) || pi.includes(cls)) return true;
                }
            }

            return false;
        }

        extractPDFUrl(iframe) {
            let pdfUrl = '';
            const encryptedSrc = iframe.getAttribute('data-pdf-lazy-original-src-enc');

            if (encryptedSrc) {
                pdfUrl = this.decryptURL(encryptedSrc);
                if (!pdfUrl) this.debug('extractPDFUrl: decryptURL returned empty, src:', encryptedSrc);
            } else {
                pdfUrl = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
            }

            if (pdfUrl.includes('pdfemb-data')) {
                try {
                    const url        = new URL(pdfUrl, window.location.href);
                    const pdfembData = url.searchParams.get('pdfemb-data');
                    if (pdfembData) {
                        const data = JSON.parse(atob(pdfembData));
                        if (data.url) { pdfUrl = data.url; this.debug('extractPDFUrl: extracted from pdfemb-data:', pdfUrl); }
                    }
                } catch (e) { this.debug('extractPDFUrl: could not parse pdfemb-data:', e); }
            }

            if (pdfUrl.includes('viewer.html') || pdfUrl.includes('pdfjs')) {
                try {
                    const url  = new URL(pdfUrl, window.location.href);
                    const file = url.searchParams.get('file') || url.searchParams.get('url') || url.searchParams.get('src');
                    if (file) pdfUrl = decodeURIComponent(file);
                } catch (e) { this.debug('extractPDFUrl: could not parse PDF.js viewer URL:', e); }
            }

            if (!pdfUrl || pdfUrl.includes('pdfemb-data')) {
                pdfUrl = iframe.getAttribute('data-pdf-url')   ||
                         iframe.getAttribute('data-url')        ||
                         iframe.getAttribute('data-pdfemb-url') || '';
            }

            return pdfUrl;
        }

        processPDFs() {
            this.debug('processPDFs: scanning iframes...');
            const allIframes = document.querySelectorAll('iframe');
            this.debug('processPDFs: total iframes found:', allIframes.length);

            const pdfIframes = [];
            allIframes.forEach(iframe => {
                if (!this.processedIframes.has(iframe) && this.isPDFIframe(iframe)) {
                    pdfIframes.push(iframe);
                }
            });

            this.debug('processPDFs: PDF iframes to process:', pdfIframes.length);
            pdfIframes.forEach((iframe, idx) => {
                this.debug('processPDFs: processing iframe', idx + 1);
                this.processIframe(iframe);
            });
        }

        setupMutationObserver() {
            const observer = new MutationObserver(mutations => {
                let shouldProcess = false;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        if (node.tagName === 'IFRAME') shouldProcess = true;
                        if (node.querySelectorAll && node.querySelectorAll('iframe').length > 0) shouldProcess = true;
                    });
                });
                if (shouldProcess) {
                    this.debug('MutationObserver: new iframes detected');
                    setTimeout(() => this.processPDFs(), 100);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            this.debug('MutationObserver: ready');
        }

        processIframe(iframe) {
            this.processedIframes.add(iframe);

            let originalSrc = '';
            const encryptedSrc = iframe.getAttribute('data-pdf-lazy-original-src-enc');
            if (encryptedSrc) {
                originalSrc = this.decryptURL(encryptedSrc);
                if (originalSrc) iframe.setAttribute('data-pdf-lazy-original-src-enc', this.encryptURL(originalSrc));
            } else {
                originalSrc = iframe.getAttribute('src') || '';
            }

            iframe.removeAttribute('data-pdf-lazy-intercepted');

            const computedStyle = window.getComputedStyle(iframe);
            const offsetWidth   = iframe.offsetWidth;
            const offsetHeight  = iframe.offsetHeight;

            let width  = offsetWidth  > 10 ? offsetWidth  + 'px' : (computedStyle.width  || '');
            let height = offsetHeight > 10 ? offsetHeight + 'px' : (computedStyle.height || '');

            if (!width || width === 'auto' || width === '0px' || width === '1px') {
                const pw = iframe.parentElement ? iframe.parentElement.offsetWidth : 0;
                width = pw > 0 ? pw + 'px' : '100%';
            }
            if (!height || height === 'auto' || height === '0px' || height === '1px') height = '600px';

            const addPx = v => (!v.includes('%') && !v.includes('px') && !v.includes('em') && !v.includes('rem'))
                ? (parseFloat(v) || 0) + 'px' : v;
            width  = addPx(width);
            height = addPx(height);

            this.debug('processIframe: dimensions width:', width, 'height:', height);

            const pdfUrl      = this.extractPDFUrl(iframe);
            const finalPdfUrl = (pdfUrl && pdfUrl !== originalSrc && !pdfUrl.includes('pdfemb-data'))
                ? pdfUrl : originalSrc;

            if (!finalPdfUrl) { this.debug('processIframe: no valid PDF URL, skipping'); return; }

            iframe.removeAttribute('src');
            Object.assign(iframe.style, {
                display: 'none', visibility: 'hidden', position: 'absolute',
                left: '-9999px', top: '-9999px', width: '1px', height: '1px',
                opacity: '0', pointerEvents: 'none', zIndex: '-1',
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

            const getFacadeHeight = () => {
                const w = window.innerWidth;
                if (w >= 1024) return (this.options.facadeHeightDesktop || 600) + 'px';
                if (w >= 768)  return (this.options.facadeHeightTablet  || 500) + 'px';
                return (this.options.facadeHeightMobile || 400) + 'px';
            };

            const facade = document.createElement('div');
            facade.className = 'pdf-facade-container pdf-lazy-loader-facade';
            facade.style.cssText = `
                width:100%;height:${getFacadeHeight()};min-height:${getFacadeHeight()};
                border-radius:8px;
                background:linear-gradient(to bottom,#f8f9fa 0%,#e9ecef 50%,#f8f9fa 100%);
                padding:40px 20px;display:flex;flex-direction:column;
                align-items:center;justify-content:center;
                position:relative;overflow:hidden;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                box-sizing:border-box;
            `;
            window.addEventListener('resize', () => {
                const h = getFacadeHeight();
                facade.style.height    = h;
                facade.style.minHeight = h;
            });

            const icon = document.createElement('div');
            icon.style.cssText = `width:80px;height:80px;background:${this.options.buttonColor};
                border-radius:8px;display:flex;align-items:center;justify-content:center;
                margin:0 auto 20px;box-shadow:0 4px 12px rgba(0,0,0,.15);`;
            icon.innerHTML = '<span style="color:#fff;font-size:32px;font-weight:700;font-family:sans-serif;">PDF</span>';

            const title = document.createElement('h3');
            title.style.cssText = 'margin:0 0 10px;color:#333;font-size:20px;font-weight:600;text-align:center;';
            title.textContent = 'PDF Document';

            const subtitle = document.createElement('p');
            subtitle.className = 'pdf-facade-subtitle';
            subtitle.style.cssText = 'margin:0 0 20px;color:#666;font-size:14px;text-align:center;';
            subtitle.textContent = 'Click the button below to load the document';

            const btnsContainer = document.createElement('div');
            btnsContainer.className = 'pdf-facade-buttons';
            btnsContainer.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';

            const viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.className = 'pdf-view-button pdf-lazy-loader-view-btn';
            viewBtn.innerHTML = '<span style="margin-right:8px">\uD83D\uDCD6</span>View PDF';
            viewBtn.style.cssText = `padding:12px 24px;background:${this.options.buttonColor};
                color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;
                cursor:pointer;transition:all .3s;display:inline-flex;align-items:center;
                box-shadow:0 2px 4px rgba(0,0,0,.1);`;
            viewBtn.addEventListener('mouseenter', () => {
                viewBtn.style.background = this.options.buttonColorHover;
                viewBtn.style.transform  = 'translateY(-2px)';
            });
            viewBtn.addEventListener('mouseleave', () => {
                viewBtn.style.background = this.options.buttonColor;
                viewBtn.style.transform  = 'translateY(0)';
            });
            viewBtn.addEventListener('click', () => {
                this.handleViewPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc);
            });
            btnsContainer.appendChild(viewBtn);

            if (this.options.enableDownload) {
                const dlBtn = document.createElement('button');
                dlBtn.type = 'button';
                dlBtn.className = 'pdf-download-button pdf-lazy-loader-download-btn';
                dlBtn.innerHTML = '<span style="margin-right:8px">\u2B07\uFE0F</span>Download';
                dlBtn.setAttribute('data-pdf-url-enc', this.encryptURL(finalPdfUrl));
                dlBtn.style.cssText = `padding:12px 24px;background:#fff;color:#333;
                    border:2px solid #ddd;border-radius:6px;font-size:14px;font-weight:600;
                    cursor:pointer;transition:all .3s;display:inline-flex;align-items:center;
                    box-shadow:0 2px 4px rgba(0,0,0,.1);`;
                dlBtn.addEventListener('mouseenter', () => { dlBtn.style.background = '#f5f5f5'; dlBtn.style.borderColor = '#bbb'; });
                dlBtn.addEventListener('mouseleave', () => { dlBtn.style.background = '#fff';    dlBtn.style.borderColor = '#ddd'; });
                dlBtn.addEventListener('click', e => { e.preventDefault(); this.handleDownloadPDF(dlBtn); });
                btnsContainer.appendChild(dlBtn);
            }

            const infoText = document.createElement('p');
            infoText.className = 'pdf-facade-info';
            infoText.style.cssText = 'margin:20px 0 0;color:#999;font-size:13px;text-align:center;';
            infoText.textContent = 'Document will be loaded on first access';

            const content = document.createElement('div');
            content.className = 'pdf-facade-content';
            content.style.cssText = 'position:relative;z-index:1;text-align:center;padding:40px 20px;display:flex;flex-direction:column;align-items:center;width:100%;';
            content.append(icon, title, subtitle, btnsContainer, infoText);
            facade.appendChild(content);
            wrapper.appendChild(facade);

            if (!iframe.parentNode) {
                if (this.options.debugMode) console.error('[PDF] Cannot insert facade — iframe has no parent node');
                return;
            }
            iframe.parentNode.insertBefore(wrapper, iframe);
            this.debug('processIframe: facade inserted');
        }

        loadPDF(iframe, facade, pdfUrl, originalSrc, wrapper) {
            this.debug('loadPDF called, url:', pdfUrl);
            if (!pdfUrl && !originalSrc) {
                if (this.options.debugMode) console.error('[PDF] Cannot load PDF: no valid URL');
                return;
            }
            originalSrc = originalSrc || pdfUrl;
            pdfUrl      = pdfUrl      || originalSrc;

            const btnsContainer = facade.querySelector('.pdf-facade-buttons');
            const subtitle      = facade.querySelector('.pdf-facade-subtitle');
            const infoText      = facade.querySelector('.pdf-facade-info');
            if (btnsContainer) btnsContainer.style.display = 'none';
            if (subtitle)      subtitle.style.display      = 'none';
            if (infoText)      infoText.style.display       = 'none';

            const spinner = document.createElement('div');
            spinner.className = 'pdf-loading-spinner';
            spinner.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px;';
            spinner.innerHTML = `
                <div class="pdf-spinner" style="width:40px;height:40px;
                    border:3px solid rgba(0,0,0,.08);
                    border-top-color:${this.options.buttonColor};
                    border-radius:50%;animation:pdf-spin .8s linear infinite;"></div>
                <div style="color:#666;font-size:13px;">Loading PDF...</div>`;

            const contentEl = facade.querySelector('.pdf-facade-content');
            const titleEl   = contentEl ? contentEl.querySelector('h3') : null;
            if (titleEl) titleEl.insertAdjacentElement('afterend', spinner);
            else if (contentEl) contentEl.appendChild(spinner);
            else facade.appendChild(spinner);

            setTimeout(() => {
                const spinnerEl = facade.querySelector('.pdf-loading-spinner');
                if (spinnerEl) spinnerEl.remove();

                if (!wrapper) wrapper = facade.closest('.pdf-facade-wrapper');
                const storedWidth  = wrapper ? wrapper.getAttribute('data-iframe-width')  : '';
                const storedHeight = wrapper ? wrapper.getAttribute('data-iframe-height') : '';

                const srcToRestore = originalSrc || pdfUrl;
                if (!srcToRestore) {
                    if (this.options.debugMode) console.error('[PDF] Cannot restore iframe: empty URL');
                    return;
                }

                iframe.setAttribute('src', srcToRestore);
                iframe.src = srcToRestore;

                if (wrapper) {
                    const parent      = wrapper.parentNode;
                    const nextSibling = wrapper.nextSibling;
                    wrapper.remove();
                    if (parent) {
                        if (nextSibling) parent.insertBefore(iframe, nextSibling);
                        else             parent.appendChild(iframe);
                    }
                } else {
                    facade.remove();
                }

                const resetStyles = ['display','visibility','position','opacity','left','top','pointerEvents','zIndex','width','height'];
                resetStyles.forEach(p => { iframe.style[p] = ''; });
                if (storedWidth)  iframe.style.width  = storedWidth;
                if (storedHeight) iframe.style.height = storedHeight;

                iframe.removeAttribute('aria-hidden');
                iframe.removeAttribute('tabindex');
                iframe.offsetHeight;

                if (typeof window.dispatchEvent !== 'undefined') {
                    window.dispatchEvent(new Event('resize'));
                }
                this.debug('loadPDF: iframe restored');
            }, this.options.loadingTime);
        }

        loadTurnstileScript() {
            return new Promise((resolve, reject) => {
                if (typeof turnstile !== 'undefined') { resolve(); return; }

                if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
                    let attempts = 0;
                    const check = setInterval(() => {
                        if (typeof turnstile !== 'undefined') { clearInterval(check); resolve(); }
                        else if (++attempts >= 50)            { clearInterval(check); reject(new Error('Turnstile load timeout')); }
                    }, 100);
                    return;
                }

                const script   = document.createElement('script');
                script.src     = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
                script.async   = true;
                script.defer   = true;
                script.onload  = () => { this.debug('Turnstile script loaded'); resolve(); };
                script.onerror = () => reject(new Error('Failed to load Turnstile script'));
                document.head.appendChild(script);
            });
        }

        initializeTurnstile(wrapper, facade) {
            return new Promise((resolve, reject) => {
                const content = facade.querySelector('.pdf-facade-content');
                if (!content) { reject(new Error('Facade content not found')); return; }

                let containerId       = wrapper.getAttribute('data-turnstile-container-id');
                let turnstileContainer = containerId ? document.getElementById(containerId) : null;

                if (!turnstileContainer) {
                    turnstileContainer       = document.createElement('div');
                    turnstileContainer.className = 'pdf-turnstile-container';
                    containerId              = 'pdf-turnstile-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    turnstileContainer.id    = containerId;
                    turnstileContainer.style.cssText = 'margin:20px 0;display:flex;flex-direction:column;align-items:center;min-height:65px;';
                    const btns = content.querySelector('.pdf-facade-buttons');
                    if (btns && btns.nextSibling) content.insertBefore(turnstileContainer, btns.nextSibling);
                    else content.appendChild(turnstileContainer);
                    wrapper.setAttribute('data-turnstile-container-id', containerId);
                }

                const btns     = facade.querySelector('.pdf-facade-buttons');
                const infoText = facade.querySelector('.pdf-facade-info');
                if (btns)     btns.style.display    = 'none';
                if (infoText) infoText.style.display = 'none';

                let msgEl = turnstileContainer.querySelector('.pdf-turnstile-message');
                if (!msgEl) {
                    msgEl             = document.createElement('p');
                    msgEl.className   = 'pdf-turnstile-message';
                    msgEl.style.cssText = 'margin:0 0 15px;color:#666;font-size:14px;text-align:center;';
                    msgEl.textContent = 'Please complete verification to continue';
                    turnstileContainer.insertBefore(msgEl, turnstileContainer.firstChild);
                }

                const siteKey = this.options.turnstileSiteKey;
                let attempts  = 0;

                const tryRender = () => {
                    if (typeof turnstile === 'undefined') {
                        if (++attempts < 50) { setTimeout(tryRender, 100); return; }
                        if (msgEl) { msgEl.textContent = 'Failed to load verification. Please refresh.'; msgEl.style.color = '#e63946'; }
                        reject(new Error('Turnstile not available'));
                        return;
                    }

                    const existingId = wrapper.getAttribute('data-turnstile-widget-id');
                    if (existingId) {
                        try {
                            const t = turnstile.getResponse(existingId);
                            if (t) { resolve(t); return; }
                        } catch (_) { wrapper.removeAttribute('data-turnstile-widget-id'); }
                    }

                    try {
                        const widgetId = turnstile.render('#' + containerId, {
                            sitekey: siteKey,
                            theme:   'light',
                            size:    'normal',
                            callback: token => {
                                this.debug('Turnstile: verified');
                                wrapper.setAttribute('data-turnstile-token', token);
                                if (msgEl)   msgEl.remove();
                                turnstileContainer.remove();
                                wrapper.removeAttribute('data-turnstile-container-id');
                                if (btns)     btns.style.display    = '';
                                if (infoText) infoText.style.display = '';
                                resolve(token);
                            },
                            'error-callback': () => {
                                this.debug('Turnstile: error');
                                wrapper.removeAttribute('data-turnstile-token');
                                if (msgEl) { msgEl.textContent = 'Verification failed. Please try again.'; msgEl.style.color = '#e63946'; }
                                reject(new Error('Turnstile verification failed'));
                            },
                            'expired-callback': () => {
                                this.debug('Turnstile: expired');
                                wrapper.removeAttribute('data-turnstile-token');
                                if (msgEl) { msgEl.textContent = 'Verification expired. Please try again.'; msgEl.style.color = '#e63946'; }
                                reject(new Error('Turnstile token expired'));
                            },
                        });
                        if (widgetId) wrapper.setAttribute('data-turnstile-widget-id', widgetId);
                    } catch (e) {
                        this.debug('Turnstile render error:', e);
                        if (msgEl) { msgEl.textContent = 'Error initializing verification. Please refresh.'; msgEl.style.color = '#e63946'; }
                        reject(e);
                    }
                };

                setTimeout(tryRender, 100);
            });
        }

        handleViewPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc) {
            if (this.options.enableTurnstile && this.options.turnstileSiteKey) {
                const token = wrapper.getAttribute('data-turnstile-token');
                if (!token) {
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
            let storedPdfUrl  = finalPdfUrl;
            let storedOrigSrc = originalSrc;
            const encPdf = wrapper.getAttribute('data-pdf-url-enc');
            const encSrc = wrapper.getAttribute('data-original-src-enc');
            if (encPdf) storedPdfUrl  = this.decryptURL(encPdf)  || finalPdfUrl;
            if (encSrc) storedOrigSrc = this.decryptURL(encSrc)  || originalSrc;

            // Load dequeued PDF Embedder assets on first click, then show PDF
            this.loadPDFEmbedderAssets()
                .then(() => this.loadPDF(iframe, facade, storedPdfUrl, storedOrigSrc, wrapper));
        }

        handleDownloadPDF(dlBtn) {
            const wrapper = dlBtn.closest('.pdf-facade-wrapper');
            if (!wrapper) { if (this.options.debugMode) console.error('[PDF] Wrapper not found'); return; }
            const facade  = wrapper.querySelector('.pdf-facade-container');
            if (!facade)  { if (this.options.debugMode) console.error('[PDF] Facade not found');  return; }

            const doDownload = () => {
                const enc = dlBtn.getAttribute('data-pdf-url-enc');
                if (!enc) return;
                const url = this.decryptURL(enc);
                if (!url) return;
                const a = document.createElement('a');
                a.href = url; a.download = ''; a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };

            if (this.options.enableTurnstile && this.options.turnstileSiteKey) {
                const token = wrapper.getAttribute('data-turnstile-token');
                if (token) { doDownload(); return; }
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
