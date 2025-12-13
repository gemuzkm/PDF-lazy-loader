

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
            debugMode: false
        };
    };

    class PDFLazyLoader {
        constructor() {
            this.options = getOptions();
            this.version = '1.0.6';
            this.processedIframes = new WeakSet(); // Track processed iframes
            this.encryptionKey = 'pdf-lazy-loader-secure-key-2024';
            
            this.debug = (...args) => {
                if (this.options.debugMode) {
                    console.log('[PDF]', ...args);
                }
            };
            
            this.debug('Initializing v' + this.version);
            this.debug('Options:', this.options);
            this.init();
        }


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
                if (this.options.debugMode) {
                    console.error('[PDF] Encryption error:', e);
                }
                return '';
            }
        }


        decryptURL(encrypted) {
            if (!encrypted) {
                this.debug('[PDF] decryptURL: empty encrypted string');
                return '';
            }
            
            try {
                const decoded = atob(encrypted);
                
                if (!decoded || decoded.length === 0) {
                    this.debug('[PDF] decryptURL: base64 decode returned empty');
                    return '';
                }
                
                let decrypted = '';
                for (let i = 0; i < decoded.length; i++) {
                    const keyChar = this.encryptionKey[i % this.encryptionKey.length];
                    decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ keyChar.charCodeAt(0));
                }
                
                if (!decrypted || decrypted.length === 0) {
                    this.debug('[PDF] decryptURL: XOR decryption returned empty');
                    return '';
                }
                
                this.debug('[PDF] decryptURL: successfully decrypted, length:', decrypted.length);
                return decrypted;
            } catch (e) {
                this.debug('[PDF] Decryption error:', e);
                if (this.options.debugMode) {
                    console.error('[PDF] Decryption error details:', e, 'encrypted length:', encrypted.length);
                }
                return '';
            }
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

            setTimeout(() => this.processPDFs(), 500);
            setTimeout(() => this.processPDFs(), 1500);
        }


        isPDFIframe(iframe) {
            if (iframe.parentElement && 
                (iframe.parentElement.querySelector('.pdf-lazy-loader-wrapper') || 
                 iframe.nextElementSibling?.classList?.contains('pdf-lazy-loader-wrapper'))) {
                return false;
            }

            const src = iframe.getAttribute('src') || '';
            const dataSrc = iframe.getAttribute('data-src') || '';
            const className = iframe.className || '';
            const id = iframe.id || '';

            const pdfIndicators = [
                '.pdf',
                'application/pdf',
                'pdf-embedder',
                'pdfembed',
                'pdfjs',
                'viewer.html',
                'pdf-viewer',
                'pdfemb-data' // PDFEmbedder parameter
            ];

            const srcToCheck = src || dataSrc;
            const lowerSrc = srcToCheck.toLowerCase();

            for (const indicator of pdfIndicators) {
                if (lowerSrc.includes(indicator)) {
                    return true;
                }
            }

            const pdfClasses = [
                'pdf-embedder',
                'pdfembed',
                'pdf-viewer',
                'pdf-container',
                'pdfemb-wrapper'
            ];

            for (const pdfClass of pdfClasses) {
                if (className.toLowerCase().includes(pdfClass) || id.toLowerCase().includes(pdfClass)) {
                    return true;
                }
            }

            const parent = iframe.parentElement;
            if (parent) {
                const parentClass = parent.className || '';
                const parentId = parent.id || '';
                for (const pdfClass of pdfClasses) {
                    if (parentClass.toLowerCase().includes(pdfClass) || parentId.toLowerCase().includes(pdfClass)) {
                        return true;
                    }
                }
            }

            return false;
        }


        extractPDFUrl(iframe) {
            let pdfUrl = '';
            const encryptedSrc = iframe.getAttribute('data-pdf-lazy-original-src-enc');
            if (encryptedSrc) {
                try {
                    pdfUrl = this.decryptURL(encryptedSrc);
                    if (!pdfUrl || pdfUrl.length === 0) {
                        throw new Error('Decryption returned empty');
                    }
                    this.debug('[PDF] Successfully decrypted URL from data-pdf-lazy-original-src-enc');
                } catch (e) {
                    this.debug('[PDF] XOR decryption failed, trying base64 fallback:', e);
                    try {
                        pdfUrl = decodeURIComponent(escape(atob(encryptedSrc)));
                        this.debug('[PDF] Base64 decode successful');
                    } catch (e2) {
                        try {
                            pdfUrl = atob(encryptedSrc);
                            this.debug('[PDF] Simple base64 decode successful');
                        } catch (e3) {
                            this.debug('[PDF] All decryption methods failed:', e3);
                            pdfUrl = '';
                        }
                    }
                }
            } else {
                pdfUrl = iframe.getAttribute('src') || 
                        iframe.getAttribute('data-src') || 
                        '';
            }

            if (pdfUrl.includes('pdfemb-data')) {
                try {
                    const url = new URL(pdfUrl, window.location.href);
                    const pdfembData = url.searchParams.get('pdfemb-data');
                    if (pdfembData) {
                        const decoded = atob(pdfembData);
                        const data = JSON.parse(decoded);
                        if (data.url) {
                            pdfUrl = data.url;
                            this.debug('[PDF] Extracted PDF URL from pdfemb-data:', pdfUrl);
                        } else {
                            this.debug('[PDF] pdfemb-data decoded but no URL found:', data);
                        }
                    }
                } catch (e) {
                    this.debug('[PDF] Could not parse pdfemb-data:', e);
                }
            }

            if (pdfUrl.includes('viewer.html') || pdfUrl.includes('pdfjs')) {
                try {
                    const url = new URL(pdfUrl, window.location.href);
                    const fileParam = url.searchParams.get('file') || 
                                    url.searchParams.get('url') ||
                                    url.searchParams.get('src');
                    if (fileParam) {
                        pdfUrl = decodeURIComponent(fileParam);
                    }
                } catch (e) {
                    this.debug('[PDF] Could not parse PDF URL from viewer:', e);
                }
            }

            if (!pdfUrl || pdfUrl.includes('pdfemb-data')) {
                pdfUrl = iframe.getAttribute('data-pdf-url') || 
                        iframe.getAttribute('data-url') ||
                        iframe.getAttribute('data-pdfemb-url') ||
                        '';
            }

            return pdfUrl;
        }

        processPDFs() {
            this.debug('[PDF] Finding PDF iframes...');
            
            const allIframes = document.querySelectorAll('iframe');
            this.debug('[PDF] Found ' + allIframes.length + ' total iframe(s)');

            let pdfIframes = [];

            allIframes.forEach((iframe) => {
                if (this.processedIframes.has(iframe)) {
                    return;
                }

                if (this.isPDFIframe(iframe)) {
                    pdfIframes.push(iframe);
                }
            });

            this.debug('[PDF] Found ' + pdfIframes.length + ' PDF iframe(s)');

            pdfIframes.forEach((iframe, index) => {
                this.debug('[PDF] Processing PDF iframe ' + (index + 1) + '...');
                this.processIframe(iframe);
            });
        }


        setupMutationObserver() {
            const observer = new MutationObserver((mutations) => {
                let shouldProcess = false;

                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            if (node.tagName === 'IFRAME') {
                                shouldProcess = true;
                            }
                            if (node.querySelectorAll && node.querySelectorAll('iframe').length > 0) {
                                shouldProcess = true;
                            }
                        }
                    });
                });

                if (shouldProcess) {
                    this.debug('[PDF] New iframes detected, processing...');
                    setTimeout(() => this.processPDFs(), 100);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            this.debug('[PDF] MutationObserver setup complete');
        }

        processIframe(iframe) {
            this.processedIframes.add(iframe);

            let originalSrc = '';
            const encryptedSrc = iframe.getAttribute('data-pdf-lazy-original-src-enc');
            if (encryptedSrc) {
                try {
                    originalSrc = this.decryptURL(encryptedSrc);
                    if (!originalSrc || originalSrc.length === 0) {
                        throw new Error('Decryption returned empty');
                    }
                } catch (e) {
                    try {
                        originalSrc = decodeURIComponent(escape(atob(encryptedSrc)));
                    } catch (e2) {
                        try {
                            originalSrc = atob(encryptedSrc);
                        } catch (e3) {
                            this.debug('[PDF] Failed to decrypt src:', e3);
                            originalSrc = '';
                        }
                    }
                }
                if (originalSrc) {
                    iframe.setAttribute('data-pdf-lazy-original-src-enc', this.encryptURL(originalSrc));
                }
            } else {
                originalSrc = iframe.getAttribute('src') || '';
            }
            
            if (iframe.hasAttribute('data-pdf-lazy-intercepted')) {
                iframe.removeAttribute('data-pdf-lazy-intercepted');
            }
            
            const computedStyle = window.getComputedStyle(iframe);
            let width = iframe.getAttribute('width') || '';
            let height = iframe.getAttribute('height') || '';
            
            const offsetWidth = iframe.offsetWidth;
            const offsetHeight = iframe.offsetHeight;
            
            this.debug('[PDF] Iframe raw dimensions - offsetWidth:', offsetWidth, 'offsetHeight:', offsetHeight);
            this.debug('[PDF] Iframe attributes - width:', iframe.getAttribute('width'), 'height:', iframe.getAttribute('height'));
            this.debug('[PDF] Iframe computed - width:', computedStyle.width, 'height:', computedStyle.height);
            
            if (offsetWidth > 10) { // Use offsetWidth if it's reasonable (more than 10px)
                width = offsetWidth + 'px';
            } else if (width && width !== 'auto' && width !== '0px' && width !== '1px') {
            } else if (computedStyle.width && computedStyle.width !== 'auto' && computedStyle.width !== '0px' && computedStyle.width !== '1px') {
                width = computedStyle.width;
            } else {
                const parent = iframe.parentElement;
                if (parent) {
                    const parentOffsetWidth = parent.offsetWidth;
                    const parentComputedWidth = window.getComputedStyle(parent).width;
                    if (parentOffsetWidth && parentOffsetWidth > 0) {
                        width = parentOffsetWidth + 'px';
                    } else if (parentComputedWidth && parentComputedWidth !== 'auto' && parentComputedWidth !== '0px') {
                        width = parentComputedWidth; // Already has 'px' unit
                    } else {
                        width = '100%';
                    }
                } else {
                    width = '100%';
                }
            }
            
            if (offsetHeight > 10) { // Use offsetHeight if it's reasonable (more than 10px)
                height = offsetHeight + 'px';
            } else if (height && height !== 'auto' && height !== '0px' && height !== '1px') {
            } else if (computedStyle.height && computedStyle.height !== 'auto' && computedStyle.height !== '0px' && computedStyle.height !== '1px') {
                height = computedStyle.height;
            } else {
                height = '600px'; // Default height
            }

            if (!width || width === '0px' || width === 'auto' || width === '1px') {
                width = '100%';
            } else if (typeof width === 'number') {
                width = width + 'px';
            } else if (!width.includes('%') && !width.includes('px') && !width.includes('em') && !width.includes('rem')) {
                const numWidth = parseFloat(width);
                if (!isNaN(numWidth)) {
                    width = numWidth + 'px';
                } else {
                    width = '100%';
                }
            }
            
            if (!height || height === '0px' || height === 'auto' || height === '1px') {
                height = '600px';
            } else if (typeof height === 'number') {
                height = height + 'px';
            } else if (!height.includes('%') && !height.includes('px') && !height.includes('em') && !height.includes('rem')) {
                const numHeight = parseFloat(height);
                if (!isNaN(numHeight)) {
                    height = numHeight + 'px';
                } else {
                    height = '600px';
                }
            }

            this.debug('[PDF] Final iframe dimensions - width:', width, 'height:', height);
            
            const pdfUrl = this.extractPDFUrl(iframe);
            
            const finalPdfUrl = (pdfUrl && pdfUrl !== originalSrc && !pdfUrl.includes('pdfemb-data')) ? pdfUrl : originalSrc;
            
            if (!finalPdfUrl) {
                this.debug('[PDF] No valid PDF URL found, skipping');
                this.debug('[PDF] Original src:', originalSrc);
                this.debug('[PDF] Extracted URL:', pdfUrl);
                return;
            }

            this.debug('[PDF] URL processing:');
            this.debug('[PDF] - Original src:', originalSrc);
            this.debug('[PDF] - Extracted URL:', pdfUrl);
            this.debug('[PDF] - Final PDF URL:', finalPdfUrl);

            this.debug('[PDF] PDF URL:', finalPdfUrl);
            this.debug('[PDF] Original src:', originalSrc);
            this.debug('[PDF] *** IFRAME HIDDEN IMMEDIATELY ***');

            if (iframe.hasAttribute('src')) {
                iframe.removeAttribute('src');
            }
            
            if (iframe.hasAttribute('data-pdf-lazy-intercepted')) {
                iframe.removeAttribute('data-pdf-lazy-intercepted');
            }
            
            iframe.style.display = 'none';
            iframe.style.visibility = 'hidden';
            iframe.style.position = 'absolute';
            iframe.style.left = '-9999px';
            iframe.style.top = '-9999px';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';
            iframe.style.zIndex = '-1';
            
            iframe.setAttribute('aria-hidden', 'true');
            iframe.setAttribute('tabindex', '-1');

            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-facade-wrapper pdf-lazy-loader-wrapper';
            wrapper.setAttribute('data-pdf-url-enc', this.encryptURL(finalPdfUrl));
            wrapper.setAttribute('data-original-src-enc', this.encryptURL(originalSrc));
            wrapper.setAttribute('data-iframe-width', width); // Store width for restoration
            wrapper.setAttribute('data-iframe-height', height); // Store height for restoration
            wrapper.style.cssText = `
                width: ${width};
                margin: 0 auto 20px;
                position: relative;
                display: block;
                visibility: visible;
                opacity: 1;
                z-index: 1;
            `;

            const getFacadeHeight = () => {
                const width = window.innerWidth;
                if (width >= 1024) {
                    return this.options.facadeHeightDesktop || 600;
                } else if (width >= 768) {
                    return this.options.facadeHeightTablet || 500;
                } else {
                    return this.options.facadeHeightMobile || 400;
                }
            };
            
            const facadeHeight = getFacadeHeight() + 'px';

            const facade = document.createElement('div');
            facade.className = 'pdf-facade-container pdf-lazy-loader-facade';
            facade.style.cssText = `
                width: 100%;
                height: ${facadeHeight};
                min-height: ${facadeHeight};
                border-radius: 8px;
                background: linear-gradient(to bottom, #f8f9fa 0%, #e9ecef 50%, #f8f9fa 100%);
                padding: 40px 20px;
                display: flex !important;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                visibility: visible !important;
                opacity: 1 !important;
                z-index: 10;
                box-sizing: border-box;
            `;
            
            facade.setAttribute('data-facade-height-desktop', this.options.facadeHeightDesktop || 600);
            facade.setAttribute('data-facade-height-tablet', this.options.facadeHeightTablet || 500);
            facade.setAttribute('data-facade-height-mobile', this.options.facadeHeightMobile || 400);
            
            facade.style.setProperty('--facade-height-desktop', (this.options.facadeHeightDesktop || 600) + 'px');
            facade.style.setProperty('--facade-height-tablet', (this.options.facadeHeightTablet || 500) + 'px');
            facade.style.setProperty('--facade-height-mobile', (this.options.facadeHeightMobile || 400) + 'px');
            
            const updateFacadeHeight = () => {
                const newHeight = getFacadeHeight() + 'px';
                facade.style.height = newHeight;
                facade.style.minHeight = newHeight;
            };
            
            window.addEventListener('resize', updateFacadeHeight);

            const content = document.createElement('div');
            content.className = 'pdf-facade-content';
            content.style.cssText = `
                position: relative;
                z-index: 1;
                text-align: center;
                padding: 40px 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 100%;
            `;

            const icon = document.createElement('div');
            icon.className = 'pdf-facade-icon';
            icon.style.cssText = `
                width: 80px;
                height: 80px;
                background: ${this.options.buttonColor};
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px auto;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            `;
            icon.innerHTML = '<span style="color: white; font-size: 32px; font-weight: 700; font-family: sans-serif; line-height: 1; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">PDF</span>';

            const title = document.createElement('h3');
            title.className = 'pdf-facade-title';
            title.style.cssText = `
                margin: 0 0 10px 0;
                color: #333;
                font-size: 20px;
                font-weight: 600;
                text-align: center;
                width: 100%;
            `;
            title.textContent = 'PDF Document';

            const subtitle = document.createElement('p');
            subtitle.className = 'pdf-facade-subtitle';
            subtitle.style.cssText = `
                margin: 0 0 20px 0;
                color: #666;
                font-size: 14px;
                text-align: center;
                width: 100%;
            `;
            subtitle.textContent = 'Click the button below to load the document';

            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'pdf-facade-buttons';
            buttonsContainer.style.cssText = `
                display: flex;
                gap: 10px;
                justify-content: center;
                flex-wrap: wrap;
            `;

            const viewButton = document.createElement('button');
            viewButton.className = 'pdf-view-button pdf-lazy-loader-view-btn';
            viewButton.type = 'button';
            viewButton.innerHTML = '<span style="margin-right: 8px;">📖</span>View PDF';
            viewButton.style.cssText = `
                padding: 12px 24px;
                background: ${this.options.buttonColor};
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                display: inline-flex;
                align-items: center;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            `;

            viewButton.addEventListener('mouseenter', () => {
                viewButton.style.background = this.options.buttonColorHover;
                viewButton.style.transform = 'translateY(-2px)';
            });
            viewButton.addEventListener('mouseleave', () => {
                viewButton.style.background = this.options.buttonColor;
                viewButton.style.transform = 'translateY(0)';
            });

            viewButton.addEventListener('click', () => {
                this.debug('[PDF] View button clicked');
                this.handleViewPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc);
            });

            buttonsContainer.appendChild(viewButton);

            if (this.options.enableDownload) {
                this.debug('[PDF] Download enabled: true');
                const downloadButton = document.createElement('button');
                downloadButton.className = 'pdf-download-button pdf-lazy-loader-download-btn';
                downloadButton.innerHTML = '<span style="margin-right: 8px;">⬇️</span>Download';
                downloadButton.type = 'button';
                downloadButton.setAttribute('data-pdf-url-enc', this.encryptURL(finalPdfUrl));
                downloadButton.style.cssText = `
                    padding: 12px 24px;
                    background: white;
                    color: #333;
                    border: 2px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    transition: all 0.3s ease;
                    display: inline-flex;
                    align-items: center;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                `;

                downloadButton.addEventListener('mouseenter', () => {
                    downloadButton.style.background = '#f5f5f5';
                    downloadButton.style.borderColor = '#bbb';
                });
                downloadButton.addEventListener('mouseleave', () => {
                    downloadButton.style.background = 'white';
                    downloadButton.style.borderColor = '#ddd';
                });

                downloadButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleDownloadPDF(downloadButton);
                });

                buttonsContainer.appendChild(downloadButton);
            } else {
                this.debug('[PDF] Download enabled: false');
            }

            const infoText = document.createElement('p');
            infoText.className = 'pdf-facade-info';
            infoText.style.cssText = `
                margin: 20px 0 0 0;
                color: #999;
                font-size: 13px;
                text-align: center;
            `;
            infoText.textContent = 'Document will be loaded on first access';


            content.appendChild(icon);
            content.appendChild(title);
            content.appendChild(subtitle);
            content.appendChild(buttonsContainer);
            content.appendChild(infoText);
            facade.appendChild(content);
            wrapper.appendChild(facade);

            if (iframe.parentNode) {
                try {
                    iframe.parentNode.insertBefore(wrapper, iframe);
                    this.debug('[PDF] Facade inserted into DOM before iframe');
                } catch (e) {
                    this.debug('[PDF] insertBefore failed, trying appendChild:', e);
                    iframe.parentNode.appendChild(wrapper);
                }
            } else {
                if (this.options.debugMode) {
                    console.error('[PDF] Cannot insert facade - iframe has no parent node');
                }
                return;
            }

            wrapper.style.setProperty('display', 'block', 'important');
            wrapper.style.setProperty('visibility', 'visible', 'important');
            wrapper.style.setProperty('opacity', '1', 'important');
            wrapper.style.setProperty('z-index', '10', 'important');
            wrapper.style.setProperty('position', 'relative', 'important');

            setTimeout(() => {
                const isInDOM = document.body.contains(wrapper) || iframe.parentNode.contains(wrapper);
                const computedDisplay = window.getComputedStyle(wrapper).display;
                const computedVisibility = window.getComputedStyle(wrapper).visibility;
                const computedOpacity = window.getComputedStyle(wrapper).opacity;
                
                this.debug('[PDF] Facade verification:');
                this.debug('[PDF] - In DOM:', isInDOM);
                this.debug('[PDF] - Display:', computedDisplay);
                this.debug('[PDF] - Visibility:', computedVisibility);
                this.debug('[PDF] - Opacity:', computedOpacity);
                this.debug('[PDF] - Wrapper dimensions:', wrapper.offsetWidth, 'x', wrapper.offsetHeight);
                this.debug('[PDF] - Facade dimensions:', facade.offsetWidth, 'x', facade.offsetHeight);
                
                if (!isInDOM || computedDisplay === 'none' || computedVisibility === 'hidden' || computedOpacity === '0') {
                    if (this.options.debugMode) {
                        console.error('[PDF] WARNING: Facade may not be visible!');
                    }
                }
            }, 100);

            this.debug('[PDF] Facade created and should be visible');
        }

        loadPDFEmbedderStyles() {
            return new Promise((resolve) => {
                // Check if styles are already loaded in DOM
                const existingStyles = document.querySelectorAll('link[rel="stylesheet"][href*="PDFEmbedder"], link[rel="stylesheet"][href*="pdfembed"], link[rel="stylesheet"][href*="pdf-embedder"], link[rel="stylesheet"][href*="pdfemb-fullscreen"]');
                if (existingStyles.length > 0) {
                    this.debug('[PDF] PDFEmbedder styles already loaded in DOM:', existingStyles.length);
                    resolve();
                    return;
                }
                
                // Get PDFEmbedder styles from localized data
                let pdfEmbedderStyles = typeof pdfLazyLoaderPDFEmbedderStyles !== 'undefined' ? pdfLazyLoaderPDFEmbedderStyles : [];
                
                // If no styles from PHP, try to find them by common patterns
                if (pdfEmbedderStyles.length === 0) {
                    this.debug('[PDF] No PDFEmbedder styles from PHP, searching by patterns');
                    const commonPaths = [
                        '/wp-content/plugins/PDFEmbedder-premium/assets/css/pdfemb-fullscreen.min.css',
                        '/wp-content/plugins/PDFEmbedder/assets/css/pdfemb-fullscreen.min.css',
                        '/wp-content/plugins/pdf-embedder/assets/css/pdfemb-fullscreen.min.css'
                    ];
                    
                    pdfEmbedderStyles = commonPaths.map(path => {
                        const fullUrl = window.location.origin + path;
                        return {
                            handle: 'pdfemb-fullscreen-css',
                            src: fullUrl,
                            deps: [],
                            ver: false
                        };
                    });
                }
                
                if (pdfEmbedderStyles.length === 0) {
                    this.debug('[PDF] No PDFEmbedder styles to load');
                    resolve();
                    return;
                }
                
                this.debug('[PDF] Loading ' + pdfEmbedderStyles.length + ' PDFEmbedder style(s)');
                
                let loadedCount = 0;
                let errorCount = 0;
                const totalStyles = pdfEmbedderStyles.length;
                
                pdfEmbedderStyles.forEach((styleData) => {
                    // Normalize URL
                    let styleUrl = styleData.src;
                    if (styleUrl.indexOf('http') !== 0) {
                        styleUrl = window.location.origin + (styleUrl.indexOf('/') === 0 ? '' : '/') + styleUrl;
                    }
                    
                    // Check if style is already loaded
                    const existingLink = document.querySelector('link[href="' + styleUrl + '"], link[href*="' + styleUrl.split('/').pop() + '"]');
                    if (existingLink) {
                        this.debug('[PDF] Style already exists:', styleUrl);
                        loadedCount++;
                        if (loadedCount + errorCount === totalStyles) {
                            resolve();
                        }
                        return;
                    }
                    
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.type = 'text/css';
                    link.href = styleUrl;
                    if (styleData.ver) {
                        link.href += (styleUrl.indexOf('?') !== -1 ? '&' : '?') + 'ver=' + styleData.ver;
                    }
                    
                    link.onload = () => {
                        this.debug('[PDF] PDFEmbedder style loaded:', styleUrl);
                        loadedCount++;
                        if (loadedCount + errorCount === totalStyles) {
                            resolve();
                        }
                    };
                    
                    link.onerror = () => {
                        this.debug('[PDF] Failed to load PDFEmbedder style (may not exist):', styleUrl);
                        errorCount++;
                        // Remove failed link
                        if (link.parentNode) {
                            link.parentNode.removeChild(link);
                        }
                        if (loadedCount + errorCount === totalStyles) {
                            resolve();
                        }
                    };
                    
                    document.head.appendChild(link);
                });
                
                // Resolve immediately if no styles to load
                if (totalStyles === 0) {
                    resolve();
                }
            });
        }

        loadPDF(iframe, facade, pdfUrl, originalSrc, wrapper) {
            this.debug('[PDF] loadPDF called');
            this.debug('[PDF] Starting loading animation: ' + this.options.loadingTime + 'ms');
            this.debug('[PDF] Original src:', originalSrc);
            this.debug('[PDF] PDF URL:', pdfUrl);
            
            // Load PDFEmbedder styles immediately when user clicks
            this.loadPDFEmbedderStyles().then(() => {
                this.debug('[PDF] PDFEmbedder styles loaded');
            }).catch((error) => {
                this.debug('[PDF] Error loading PDFEmbedder styles:', error);
            });
            
            if (!originalSrc && !pdfUrl) {
                this.debug('[PDF] ERROR: Both originalSrc and pdfUrl are empty!');
                console.error('[PDF] Cannot load PDF: no valid URL provided');
                return;
            }
            
            if (!originalSrc) {
                this.debug('[PDF] WARNING: originalSrc is empty, using pdfUrl');
                originalSrc = pdfUrl;
            }
            
            if (!pdfUrl) {
                this.debug('[PDF] WARNING: pdfUrl is empty, using originalSrc');
                pdfUrl = originalSrc;
            }

            const buttonsContainer = facade.querySelector('.pdf-facade-buttons');
            const subtitle = facade.querySelector('.pdf-facade-subtitle');
            const infoText = facade.querySelector('.pdf-facade-info');
            if (buttonsContainer) {
                buttonsContainer.style.display = 'none';
            }
            if (subtitle) {
                subtitle.style.display = 'none';
            }
            if (infoText) {
                infoText.style.display = 'none';
            }
            
            const loadingSpinner = document.createElement('div');
            loadingSpinner.className = 'pdf-loading-spinner';
            loadingSpinner.style.cssText = `
                position: relative;
                width: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin: 8px 0 0 0;
                z-index: 10;
            `;
            
            const spinner = document.createElement('div');
            spinner.className = 'pdf-spinner';
            spinner.style.cssText = `
                width: 40px;
                height: 40px;
                border: 3px solid rgba(0, 0, 0, 0.08);
                border-top-color: ${this.options.buttonColor};
                border-right-color: ${this.options.buttonColor};
                border-radius: 50%;
                animation: pdf-spin 0.8s linear infinite;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                flex-shrink: 0;
            `;
            
            const loadingText = document.createElement('div');
            loadingText.className = 'pdf-loading-text';
            loadingText.style.cssText = `
                color: #666;
                font-size: 13px;
                font-weight: 500;
                margin: 0;
                text-align: center;
                line-height: 1.4;
            `;
            loadingText.textContent = 'Loading PDF...';
            
            loadingSpinner.appendChild(spinner);
            loadingSpinner.appendChild(loadingText);
            
            const content = facade.querySelector('.pdf-facade-content');
            if (content) {
                const title = content.querySelector('.pdf-facade-title');
                if (title) {
                    title.insertAdjacentElement('afterend', loadingSpinner);
                } else {
                    content.appendChild(loadingSpinner);
                }
            } else {
                facade.appendChild(loadingSpinner);
            }

            setTimeout(() => {
                this.debug('[PDF] IFRAME SHOWN');
                
                const spinnerElement = facade.querySelector('.pdf-loading-spinner');
                if (spinnerElement) {
                    spinnerElement.remove();
                }
                
                const buttonsContainer = facade.querySelector('.pdf-facade-buttons');
                if (buttonsContainer) {
                    buttonsContainer.style.opacity = '1';
                }
                
                if (!wrapper) {
                    wrapper = facade.closest('.pdf-facade-wrapper');
                }
                
                let wrapperWidth = '';
                let wrapperHeight = '';
                if (wrapper) {
                    wrapperWidth = wrapper.getAttribute('data-iframe-width') || '';
                    wrapperHeight = wrapper.getAttribute('data-iframe-height') || '';
                    
                    if (!wrapperWidth || !wrapperHeight) {
                        const wrapperComputedStyle = window.getComputedStyle(wrapper);
                        wrapperWidth = wrapperWidth || wrapperComputedStyle.width || wrapper.style.width || '';
                        wrapperHeight = wrapperHeight || wrapperComputedStyle.height || wrapper.style.height || '';
                    }
                    
                    this.debug('[PDF] Wrapper dimensions to preserve - width:', wrapperWidth, 'height:', wrapperHeight);
                }
                
                const srcToRestore = originalSrc || pdfUrl;
                this.debug('[PDF] Restoring iframe src:', srcToRestore);
                
                if (!srcToRestore || srcToRestore.trim() === '') {
                    this.debug('[PDF] ERROR: Cannot restore iframe - srcToRestore is empty!');
                    console.error('[PDF] Cannot restore iframe: empty URL');
                    return;
                }
                
                iframe.setAttribute('src', srcToRestore);
                
                iframe.src = srcToRestore;
                
                if (wrapper) {
                    const wrapperParent = wrapper.parentNode;
                    const wrapperNextSibling = wrapper.nextSibling;
                    
                    const facadeInWrapper = wrapper.querySelector('.pdf-facade-container');
                    if (facadeInWrapper) {
                        facadeInWrapper.remove();
                    }
                    
                    wrapper.remove();
                    
                    if (wrapperParent) {
                        if (wrapperNextSibling) {
                            wrapperParent.insertBefore(iframe, wrapperNextSibling);
                        } else {
                            wrapperParent.appendChild(iframe);
                        }
                    }
                } else {
                    facade.remove();
                }
                
                iframe.style.display = '';
                iframe.style.visibility = '';
                iframe.style.position = '';
                iframe.style.opacity = '';
                iframe.style.left = '';
                iframe.style.top = '';
                iframe.style.pointerEvents = '';
                iframe.style.zIndex = '';
                
                if (wrapperWidth) {
                    iframe.style.width = wrapperWidth;
                    const widthValue = wrapperWidth.replace('px', '').replace('%', '');
                    if (widthValue) {
                        iframe.setAttribute('width', widthValue + (wrapperWidth.includes('%') ? '%' : ''));
                    }
                }
                if (wrapperHeight) {
                    iframe.style.height = wrapperHeight;
                    const heightValue = wrapperHeight.replace('px', '').replace('%', '');
                    if (heightValue) {
                        iframe.setAttribute('height', heightValue + (wrapperHeight.includes('%') ? '%' : ''));
                    }
                }
                
                iframe.offsetHeight; // Trigger reflow
                
                iframe.removeAttribute('aria-hidden');
                iframe.removeAttribute('tabindex');
                
                this.debug('[PDF] Iframe restored and visible');
                this.debug('[PDF] Iframe dimensions - width:', iframe.style.width, 'height:', iframe.style.height);
                this.debug('[PDF] Iframe offset dimensions - width:', iframe.offsetWidth, 'height:', iframe.offsetHeight);
                
                if (typeof jQuery !== 'undefined' && jQuery.fn.pdfEmbedder) {
                    this.debug('[PDF] Reinitializing PDFEmbedder');
                    try {
                        jQuery(iframe).pdfEmbedder();
                    } catch (e) {
                        this.debug('[PDF] PDFEmbedder reinitialization failed:', e);
                    }
                }
                
                if (typeof window.dispatchEvent !== 'undefined') {
                    window.dispatchEvent(new Event('resize'));
                }
            }, this.options.loadingTime);
        }


        loadTurnstileScript() {
            return new Promise((resolve, reject) => {
                if (typeof turnstile !== 'undefined') {
                    resolve();
                    return;
                }
                
                if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
                    let attempts = 0;
                    const maxAttempts = 50;
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (typeof turnstile !== 'undefined') {
                            clearInterval(checkInterval);
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                            reject(new Error('Turnstile script failed to load'));
                        }
                    }, 100);
                    return;
                }
                
                const script = document.createElement('script');
                script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
                script.async = true;
                script.defer = true;
                script.onload = () => {
                    this.debug('[PDF] Turnstile script loaded');
                    resolve();
                };
                script.onerror = () => {
                    this.debug('[PDF] Failed to load Turnstile script');
                    reject(new Error('Failed to load Turnstile script'));
                };
                document.head.appendChild(script);
            });
        }


        initializeTurnstile(wrapper, facade) {
            return new Promise((resolve, reject) => {
                let containerId = wrapper.getAttribute('data-turnstile-container-id');
                let turnstileContainer = null;
                
                if (containerId) {
                    turnstileContainer = document.getElementById(containerId);
                }
                
                if (!turnstileContainer) {
                    const content = facade.querySelector('.pdf-facade-content');
                    if (!content) {
                        reject(new Error('Facade content not found'));
                        return;
                    }
                    
                    turnstileContainer = document.createElement('div');
                    turnstileContainer.className = 'pdf-turnstile-container';
                    containerId = 'pdf-turnstile-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    turnstileContainer.id = containerId;
                    turnstileContainer.style.cssText = `
                        margin: 20px 0;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        min-height: 65px;
                    `;
                    
                    const buttonsContainer = content.querySelector('.pdf-facade-buttons');
                    if (buttonsContainer && buttonsContainer.nextSibling) {
                        content.insertBefore(turnstileContainer, buttonsContainer.nextSibling);
                    } else {
                        content.appendChild(turnstileContainer);
                    }
                    
                    wrapper.setAttribute('data-turnstile-container-id', containerId);
                }
                
                const buttonsContainer = facade.querySelector('.pdf-facade-buttons');
                const infoText = facade.querySelector('.pdf-facade-info');
                if (buttonsContainer) {
                    buttonsContainer.style.display = 'none';
                }
                if (infoText) {
                    infoText.style.display = 'none';
                }
                
                let messageEl = turnstileContainer.querySelector('.pdf-turnstile-message');
                if (!messageEl) {
                    messageEl = document.createElement('p');
                    messageEl.className = 'pdf-turnstile-message';
                    messageEl.style.cssText = `
                        margin: 0 0 15px 0;
                        color: #666;
                        font-size: 14px;
                        text-align: center;
                        width: 100%;
                        order: -1;
                    `;
                    messageEl.textContent = 'Please complete verification to continue';
                    turnstileContainer.insertBefore(messageEl, turnstileContainer.firstChild);
                }
                
                const self = this;
                const siteKey = this.options.turnstileSiteKey;
                let initAttempts = 0;
                const maxInitAttempts = 50;
                
                const initTurnstile = () => {
                    if (typeof turnstile !== 'undefined') {
                        try {
                            const existingWidgetId = wrapper.getAttribute('data-turnstile-widget-id');
                            if (existingWidgetId) {
                                try {
                                    const token = turnstile.getResponse(existingWidgetId);
                                    if (token) {
                                        resolve(token);
                                        return;
                                    }
                                } catch (e) {
                                    wrapper.removeAttribute('data-turnstile-widget-id');
                                }
                            }
                            
                            const widgetId = turnstile.render('#' + containerId, {
                                sitekey: siteKey,
                                theme: 'light',
                                size: 'normal',
                                callback: function(token) {
                                    self.debug('[PDF] Turnstile verification successful');
                                    wrapper.setAttribute('data-turnstile-token', token);
                                    
                                    if (messageEl) {
                                        messageEl.remove();
                                    }
                                    turnstileContainer.remove();
                                    wrapper.removeAttribute('data-turnstile-container-id');
                                    
                                    if (buttonsContainer) {
                                        buttonsContainer.style.display = '';
                                    }
                                    if (infoText) {
                                        infoText.style.display = '';
                                    }
                                    
                                    resolve(token);
                                },
                                'error-callback': function() {
                                    self.debug('[PDF] Turnstile verification failed');
                                    wrapper.removeAttribute('data-turnstile-token');
                                    
                                    if (messageEl) {
                                        messageEl.textContent = 'Verification failed. Please try again.';
                                        messageEl.style.color = '#e63946';
                                    }
                                    
                                    reject(new Error('Turnstile verification failed'));
                                },
                                'expired-callback': function() {
                                    self.debug('[PDF] Turnstile token expired');
                                    wrapper.removeAttribute('data-turnstile-token');
                                    
                                    if (messageEl) {
                                        messageEl.textContent = 'Verification expired. Please try again.';
                                        messageEl.style.color = '#e63946';
                                    }
                                    
                                    reject(new Error('Turnstile token expired'));
                                }
                            });
                            
                            if (widgetId) {
                                wrapper.setAttribute('data-turnstile-widget-id', widgetId);
                                self.debug('[PDF] Turnstile widget initialized with ID:', widgetId);
                            }
                        } catch (e) {
                            self.debug('[PDF] Turnstile render error:', e);
                            if (messageEl) {
                                messageEl.textContent = 'Error initializing verification. Please refresh the page.';
                                messageEl.style.color = '#e63946';
                            }
                            reject(e);
                        }
                    } else {
                        initAttempts++;
                        if (initAttempts < maxInitAttempts) {
                            setTimeout(initTurnstile, 100);
                        } else {
                            self.debug('[PDF] Turnstile script failed to load');
                            if (messageEl) {
                                messageEl.textContent = 'Failed to load verification. Please refresh the page.';
                                messageEl.style.color = '#e63946';
                            }
                            reject(new Error('Turnstile script failed to load'));
                        }
                    }
                };
                
                setTimeout(initTurnstile, 100);
            });
        }


        handleViewPDF(wrapper, iframe, facade, finalPdfUrl, originalSrc) {
            if (this.options.enableTurnstile && this.options.turnstileSiteKey) {
                let token = wrapper.getAttribute('data-turnstile-token');
                
                if (token) {
                    this.debug('[PDF] Turnstile token found, proceeding with PDF load');
                } else {
                    this.debug('[PDF] Turnstile verification required');
                    
                    this.loadTurnstileScript()
                        .then(() => {
                            return this.initializeTurnstile(wrapper, facade);
                        })
                        .then((token) => {
                            this.debug('[PDF] Turnstile verified, proceeding with PDF load');
                            const encryptedPdfUrl = wrapper.getAttribute('data-pdf-url-enc');
                            const encryptedOriginalSrc = wrapper.getAttribute('data-original-src-enc');
                            
                            this.debug('[PDF] Encrypted PDF URL from wrapper:', encryptedPdfUrl ? 'exists' : 'missing');
                            this.debug('[PDF] Encrypted original src from wrapper:', encryptedOriginalSrc ? 'exists' : 'missing');
                            
                            let storedPdfUrl = finalPdfUrl;
                            let storedOriginalSrc = originalSrc;
                            
                            if (encryptedPdfUrl) {
                                try {
                                    storedPdfUrl = this.decryptURL(encryptedPdfUrl);
                                    this.debug('[PDF] Decrypted PDF URL:', storedPdfUrl);
                                } catch (e) {
                                    this.debug('[PDF] Failed to decrypt PDF URL, using fallback:', e);
                                    storedPdfUrl = finalPdfUrl;
                                }
                            }
                            
                            if (encryptedOriginalSrc) {
                                try {
                                    storedOriginalSrc = this.decryptURL(encryptedOriginalSrc);
                                    this.debug('[PDF] Decrypted original src:', storedOriginalSrc);
                                } catch (e) {
                                    this.debug('[PDF] Failed to decrypt original src, using fallback:', e);
                                    storedOriginalSrc = originalSrc;
                                }
                            }
                            
                            this.loadPDF(iframe, facade, storedPdfUrl, storedOriginalSrc, wrapper);
                        })
                        .catch((error) => {
                            this.debug('[PDF] Turnstile verification error:', error);
                        });
                    
                    return; // Don't proceed until verification is complete
                }
            }
            
            const encryptedPdfUrl = wrapper.getAttribute('data-pdf-url-enc');
            const encryptedOriginalSrc = wrapper.getAttribute('data-original-src-enc');
            
            this.debug('[PDF] Encrypted PDF URL from wrapper:', encryptedPdfUrl ? 'exists' : 'missing');
            this.debug('[PDF] Encrypted original src from wrapper:', encryptedOriginalSrc ? 'exists' : 'missing');
            
            let storedPdfUrl = finalPdfUrl;
            let storedOriginalSrc = originalSrc;
            
            if (encryptedPdfUrl) {
                try {
                    storedPdfUrl = this.decryptURL(encryptedPdfUrl);
                    this.debug('[PDF] Decrypted PDF URL:', storedPdfUrl);
                } catch (e) {
                    this.debug('[PDF] Failed to decrypt PDF URL, using fallback:', e);
                    storedPdfUrl = finalPdfUrl;
                }
            }
            
            if (encryptedOriginalSrc) {
                try {
                    storedOriginalSrc = this.decryptURL(encryptedOriginalSrc);
                    this.debug('[PDF] Decrypted original src:', storedOriginalSrc);
                } catch (e) {
                    this.debug('[PDF] Failed to decrypt original src, using fallback:', e);
                    storedOriginalSrc = originalSrc;
                }
            }
            
            this.loadPDF(iframe, facade, storedPdfUrl, storedOriginalSrc, wrapper);
        }


        handleDownloadPDF(downloadButton) {
            const wrapper = downloadButton.closest('.pdf-facade-wrapper');
            
            if (!wrapper) {
                if (this.options.debugMode) {
                    console.error('[PDF] Wrapper not found for download button');
                }
                return;
            }
            
            const facade = wrapper.querySelector('.pdf-facade-container');
            if (!facade) {
                if (this.options.debugMode) {
                    console.error('[PDF] Facade not found for download button');
                }
                return;
            }
            
            if (this.options.enableTurnstile && this.options.turnstileSiteKey) {
                let token = wrapper.getAttribute('data-turnstile-token');
                
                if (token) {
                    this.debug('[PDF] Turnstile token found, proceeding with download');
                } else {
                    this.debug('[PDF] Turnstile verification required for download');
                    
                    this.loadTurnstileScript()
                        .then(() => {
                            return this.initializeTurnstile(wrapper, facade);
                        })
                        .then((token) => {
                            this.debug('[PDF] Turnstile verified, proceeding with download');
                            const encryptedUrl = downloadButton.getAttribute('data-pdf-url-enc');
                            if (encryptedUrl) {
                                const pdfUrl = this.decryptURL(encryptedUrl);
                                if (pdfUrl) {
                                    const link = document.createElement('a');
                                    link.href = pdfUrl;
                                    link.download = '';
                                    link.style.display = 'none';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                }
                            }
                        })
                        .catch((error) => {
                            this.debug('[PDF] Turnstile verification error:', error);
                        });
                    
                    return; // Don't proceed until verification is complete
                }
            }
            
            const encryptedUrl = downloadButton.getAttribute('data-pdf-url-enc');
            if (encryptedUrl) {
                const pdfUrl = this.decryptURL(encryptedUrl);
                if (pdfUrl) {
                    const link = document.createElement('a');
                    link.href = pdfUrl;
                    link.download = '';
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.PDFLazyLoader = new PDFLazyLoader();
        });
    } else {
        window.PDFLazyLoader = new PDFLazyLoader();
    }
})();
