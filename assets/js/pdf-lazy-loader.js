/**
 * PDF Lazy Loader - Main JavaScript with URL Obfuscation
 * Main JavaScript code of the plugin
 * 
 * This file contains all the logic for PDF loading with obfuscated PDF URLs
 * Compatible with Redis Object Cache and FlyingPress
 */

(function() {
    'use strict';

    /**
     * URL Obfuscation Utility
     * Hides PDF URLs from simple source code inspection
     */
    class URLObfuscator {
        /**
         * Obfuscate URL by encoding parts
         *
         * @param {string} url
         * @returns {string}
         */
        static obfuscate(url) {
            try {
                // Split URL into parts to avoid full URL exposure
                const parts = url.split('?');
                if (parts.length !== 2) return url;

                const base = parts[0];
                const query = parts[1];

                // Encode query parameters
                const encoded = btoa(encodeURIComponent(query));
                
                // Store in data attribute instead of direct concatenation
                return base + '?__d=' + encoded;
            } catch (e) {
                return url;
            }
        }

        /**
         * Deobfuscate URL
         *
         * @param {string} url
         * @returns {string}
         */
        static deobfuscate(url) {
            try {
                if (url.indexOf('?__d=') === -1) {
                    return url;
                }

                const parts = url.split('?__d=');
                const base = parts[0];
                const encoded = parts[1];

                // Decode query parameters
                const query = decodeURIComponent(atob(encoded));
                
                return base + '?' + query;
            } catch (e) {
                return url;
            }
        }

        /**
         * Extract PDF data from iframe safely
         *
         * @param {string} iframeSrc
         * @returns {string|null}
         */
        static extractPDFUrl(iframeSrc) {
            try {
                // First, deobfuscate if needed
                const deobfuscated = this.deobfuscate(iframeSrc);
                const url = new URL(deobfuscated, window.location.origin);
                
                // Get encoded data
                const encoded = url.searchParams.get('__d') || url.searchParams.get('pdfemb-data');
                if (!encoded) return null;

                // Decode
                const urlSafeBase64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
                const padded = urlSafeBase64 + '=='.slice(0, (4 - urlSafeBase64.length % 4) % 4);
                const jsonStr = atob(padded);
                const data = JSON.parse(jsonStr);
                
                return data.url || null;
            } catch (e) {
                return null;
            }
        }
    }

    /**
     * PDF Lazy Loader - main class
     */
    class PDFLazyLoader {
        constructor(options = {}) {
            this.options = {
                buttonColor: options.buttonColor || '#FF6B6B',
                buttonColorHover: options.buttonColorHover || '#E63946',
                loadingTime: options.loadingTime || 1500,
                debugMode: options.debugMode || false,
                enableDownload: options.enableDownload !== undefined ? options.enableDownload : true,
                ...options
            };

            this.pdfContainers = [];
            this.loadedPDFs = new Map();
            this.processedElements = new Set();
            this.urlObfuscator = URLObfuscator;
            this.init();
        }

        /**
         * Initialization
         */
        init() {
            this.log('PDF Lazy Loader initialized');

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupPDFs());
            } else {
                this.setupPDFs();
            }

            this.observeMutations();
            this.dispatchReady();
        }

        /**
         * Dispatch ready event
         */
        dispatchReady() {
            const event = new CustomEvent('pdfLazyLoaderReady', {
                detail: { loader: this }
            });
            document.dispatchEvent(event);
        }

        /**
         * Observe DOM changes for AJAX content
         */
        observeMutations() {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) {
                                const pdfs = node.querySelectorAll('[data-pdfemb-lazy]');
                                pdfs.forEach((pdf) => this.processPDF(pdf));

                                // Check for PDF Embedder containers
                                const containers = node.querySelectorAll('iframe.pdfembed-iframe');
                                containers.forEach((container) => this.processIframe(container));
                            }
                        });
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }

        /**
         * Main function: process all PDF containers
         */
        setupPDFs() {
            // Method 1: Find by iframe class (PDF Embedder)
            const iframes = document.querySelectorAll('iframe.pdfembed-iframe');
            iframes.forEach((iframe) => {
                if (!this.processedElements.has(iframe)) {
                    this.processIframe(iframe);
                    this.processedElements.add(iframe);
                }
            });

            // Method 2: Find by data-attributes
            const dataPDFs = document.querySelectorAll('[data-pdfemb-lazy="true"]');
            dataPDFs.forEach((pdf) => {
                if (!this.processedElements.has(pdf)) {
                    this.processPDF(pdf);
                    this.processedElements.add(pdf);
                }
            });

            this.log(`Found ${this.pdfContainers.length} PDF(s)`);
        }

        /**
         * Process individual PDF
         */
        processPDF(element) {
            if (element.tagName === 'IFRAME') {
                this.processIframe(element);
            }
        }

        /**
         * Process iframe and wrap it in Facade
         */
        processIframe(iframe) {
            // Check if already processed
            if (iframe.closest('.pdf-facade-wrapper')) {
                return;
            }

            // Extract PDF URL safely with obfuscation handling
            const pdfUrl = this.urlObfuscator.extractPDFUrl(iframe.src);
            if (!pdfUrl) {
                this.log('Could not extract PDF URL from: [OBFUSCATED URL]');
                return;
            }

            const wrapper = this.createFacade(iframe, pdfUrl);
            iframe.parentNode.insertBefore(wrapper, iframe);
            iframe.style.display = 'none';
            iframe.classList.add('pdf-lazy-loading-iframe');

            wrapper.dataset.iframeId = this.generateUID();
            this.pdfContainers.push({
                id: wrapper.dataset.iframeId,
                wrapper: wrapper,
                iframe: iframe,
                pdfUrl: pdfUrl,
                isLoaded: false,
            });

            this.log('Processed PDF from obfuscated source');
        }

        /**
         * Create Facade element
         */
        createFacade(iframe, pdfUrl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-facade-wrapper';

            const width = iframe.style.width || '100%';
            const height = iframe.style.height || '600px';
            const maxWidth = iframe.style.maxWidth || '100%';

            const downloadBtn = this.options.enableDownload 
                ? `<button class="pdf-download-button" type="button" style="
                    padding: 12px 24px;
                    background: white;
                    color: #333;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">
                    ⬇ Download
                </button>`
                : '';

            wrapper.innerHTML = `
                <div class="pdf-facade-container" style="
                    width: 100%;
                    max-width: ${maxWidth};
                    height: ${height};
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    background: #f5f5f5;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    overflow: hidden;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                ">
                    <div class="pdf-facade-background" style="
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
                        z-index: 0;
                    "></div>

                    <div class="pdf-facade-content" style="
                        position: relative;
                        z-index: 1;
                        text-align: center;
                        padding: 40px 20px;
                    ">
                        <div class="pdf-facade-icon" style="margin-bottom: 20px;">
                            <svg width="64" height="80" viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="4" y="4" width="56" height="72" rx="2" fill="${this.options.buttonColor}" stroke="#C92A2A" stroke-width="2"/>
                                <text x="32" y="48" font-size="24" font-weight="bold" fill="white" text-anchor="middle">PDF</text>
                            </svg>
                        </div>

                        <h3 class="pdf-facade-title" style="
                            margin: 0 0 10px 0;
                            color: #333;
                            font-size: 18px;
                            font-weight: 600;
                        ">PDF Document</h3>

                        <p class="pdf-facade-subtitle" style="
                            margin: 0 0 20px 0;
                            color: #666;
                            font-size: 14px;
                        ">Click the button below to load the document</p>

                        <div class="pdf-loading-indicator" style="
                            display: none;
                            margin-bottom: 20px;
                        ">
                            <div class="pdf-spinner" style="
                                width: 30px;
                                height: 30px;
                                border: 3px solid #f3f3f3;
                                border-top: 3px solid ${this.options.buttonColor};
                                border-radius: 50%;
                                animation: spin 1s linear infinite;
                                margin: 0 auto;
                            "></div>
                            <p class="pdf-loading-text" style="
                                margin: 10px 0 0 0;
                                color: #666;
                                font-size: 12px;
                            ">Loading PDF...</p>
                        </div>

                        <div class="pdf-facade-buttons" style="
                            display: flex;
                            gap: 10px;
                            justify-content: center;
                            flex-wrap: wrap;
                        ">
                            <button class="pdf-view-button" type="button" style="
                                padding: 12px 24px;
                                background: ${this.options.buttonColor};
                                color: white;
                                border: none;
                                border-radius: 4px;
                                font-size: 14px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.3s ease;
                            ">
                                📖 View PDF
                            </button>
                            ${downloadBtn}
                        </div>

                        <p class="pdf-facade-info" style="
                            margin: 20px 0 0 0;
                            color: #999;
                            font-size: 12px;
                        ">Document will be loaded on first access</p>
                    </div>
                </div>
            `;

            this.addSpinnerAnimation();

            const viewBtn = wrapper.querySelector('.pdf-view-button');
            const dlBtn = wrapper.querySelector('.pdf-download-button');

            viewBtn.addEventListener('click', () => this.loadPDF(wrapper.dataset.iframeId, 'view'));
            if (dlBtn) {
                dlBtn.addEventListener('click', () => this.downloadPDF(pdfUrl));
            }

            viewBtn.addEventListener('mouseenter', (e) => {
                e.target.style.background = this.options.buttonColorHover;
                e.target.style.transform = 'translateY(-2px)';
            });
            viewBtn.addEventListener('mouseleave', (e) => {
                e.target.style.background = this.options.buttonColor;
                e.target.style.transform = 'translateY(0)';
            });

            if (dlBtn) {
                dlBtn.addEventListener('mouseenter', (e) => {
                    e.target.style.borderColor = this.options.buttonColor;
                    e.target.style.color = this.options.buttonColor;
                });
                dlBtn.addEventListener('mouseleave', (e) => {
                    e.target.style.borderColor = '#ddd';
                    e.target.style.color = '#333';
                });
            }

            return wrapper;
        }

        /**
         * Load PDF on button click (NOT on page load)
         */
        loadPDF(wrapperId, mode = 'view') {
            const pdfEntry = this.pdfContainers.find((p) => p.id === wrapperId);
            if (!pdfEntry) return;

            if (pdfEntry.isLoaded) {
                this.showPDF(pdfEntry);
                return;
            }

            const wrapper = pdfEntry.wrapper;
            const buttons = wrapper.querySelector('.pdf-facade-buttons');
            const loadingIndicator = wrapper.querySelector('.pdf-loading-indicator');

            buttons.style.display = 'none';
            loadingIndicator.style.display = 'block';

            // Load after delay
            setTimeout(() => {
                pdfEntry.isLoaded = true;
                this.showPDF(pdfEntry);
            }, this.options.loadingTime);
        }

        /**
         * Show loaded PDF
         */
        showPDF(pdfEntry) {
            const wrapper = pdfEntry.wrapper;
            const iframe = pdfEntry.iframe;

            wrapper.style.display = 'none';
            iframe.style.display = 'block';

            if (window.PDFEmbedderAutoResize) {
                window.PDFEmbedderAutoResize(iframe);
            } else {
                iframe.style.width = '100%';
                iframe.style.height = iframe.dataset.height || '600px';
            }

            window.dispatchEvent(
                new CustomEvent('pdfembedder:loaded', {
                    detail: { iframe: iframe, pdfEntry: pdfEntry },
                })
            );

            setTimeout(() => {
                iframe.dispatchEvent(new Event('resize'));
            }, 100);

            this.log('PDF loaded and displayed');
        }

        /**
         * Download PDF file
         */
        downloadPDF(pdfUrl) {
            if (!pdfUrl) return;
            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = 'document.pdf';
            link.click();
        }

        /**
         * Add CSS for loading spinner
         */
        addSpinnerAnimation() {
            if (document.getElementById('pdf-lazy-loader-styles')) return;

            const style = document.createElement('style');
            style.id = 'pdf-lazy-loader-styles';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .pdf-facade-wrapper {
                    width: 100%;
                    margin-bottom: 0;
                }

                .pdf-facade-container {
                    transition: all 0.3s ease;
                }

                .pdf-facade-buttons button {
                    font-family: inherit;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .pdf-facade-buttons button:active {
                    transform: scale(0.98);
                }

                @media (prefers-color-scheme: dark) {
                    .pdf-facade-container {
                        background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                        border-color: #444;
                    }
                    .pdf-facade-title {
                        color: #fff !important;
                    }
                    .pdf-facade-subtitle, .pdf-loading-text, .pdf-facade-info {
                        color: #bbb !important;
                    }
                    .pdf-download-button {
                        background: #333 !important;
                        color: #fff !important;
                        border-color: #555 !important;
                    }
                }

                @media (max-width: 600px) {
                    .pdf-facade-content {
                        padding: 20px 15px !important;
                    }
                    .pdf-facade-icon svg {
                        width: 48px !important;
                        height: 60px !important;
                    }
                    .pdf-facade-title {
                        font-size: 16px !important;
                    }
                    .pdf-facade-buttons {
                        flex-direction: column !important;
                    }
                    .pdf-facade-buttons button {
                        width: 100%;
                    }
                }
            `;

            document.head.appendChild(style);
        }

        /**
         * Generate unique ID
         */
        generateUID() {
            return 'pdf-' + Math.random().toString(36).substr(2, 9);
        }

        /**
         * Logging
         */
        log(message) {
            if (this.options.debugMode) {
                console.log('[PDFLazyLoader] ' + message);
            }
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new PDFLazyLoader(typeof pdfLazyLoaderData !== 'undefined' ? pdfLazyLoaderData : {});
        });
    } else {
        new PDFLazyLoader(typeof pdfLazyLoaderData !== 'undefined' ? pdfLazyLoaderData : {});
    }

    // Export for usage
    window.PDFLazyLoader = PDFLazyLoader;
})();
