/**
 * PDF Lazy Loader v1.0.4
 * Main JavaScript handler for lazy loading PDF embeds
 */

(function() {
    'use strict';

    class URLExtractor {
        static extractURL(iframeSrc) {
            try {
                if (!iframeSrc) return null;
                
                const url = new URL(iframeSrc, window.location.origin);
                const encoded = url.searchParams.get('__d') || url.searchParams.get('pdfemb-data');
                
                if (!encoded) {
                    console.log('[PDF] No encoded data found');
                    return null;
                }

                const urlSafeBase64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
                const padded = urlSafeBase64 + '=='.slice(0, (4 - urlSafeBase64.length % 4) % 4);
                
                try {
                    const jsonStr = atob(padded);
                    const data = JSON.parse(jsonStr);
                    return data.url || null;
                } catch (e) {
                    console.log('[PDF] Could not decode URL');
                    return null;
                }
            } catch (e) {
                console.log('[PDF] Error extracting URL:', e.message);
                return null;
            }
        }
    }

    class PDFLazyLoader {
        constructor(options = {}) {
            if (!options || typeof options !== 'object') {
                options = {};
            }

            this.options = {
                buttonColor: options.buttonColor || '#FF6B6B',
                buttonColorHover: options.buttonColorHover || '#E63946',
                loadingTime: Math.max(500, Math.min(5000, options.loadingTime || 1500)),
                enableDownload: options.enableDownload === true || options.enableDownload === 'true',
            };

            console.log('[PDF] Initializing v1.0.4');
            console.log('[PDF] Download enabled:', this.options.enableDownload);

            this.pdfContainers = [];
            this.processedElements = new Set();
            this.init();
        }

        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupPDFs());
            } else {
                this.setupPDFs();
            }
            this.observeMutations();
        }

        observeMutations() {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) {
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

        setupPDFs() {
            console.log('[PDF] Finding PDF iframes...');
            
            const iframes = document.querySelectorAll('iframe.pdfembed-iframe');
            console.log('[PDF] Found ' + iframes.length + ' iframe(s)');

            iframes.forEach((iframe) => {
                if (!this.processedElements.has(iframe)) {
                    this.processIframe(iframe);
                    this.processedElements.add(iframe);
                }
            });
        }

        processIframe(iframe) {
            console.log('[PDF] Processing iframe...');

            // CRITICAL: Check if already processed
            if (iframe.closest('.pdf-facade-wrapper')) {
                console.log('[PDF] Already processed, skipping');
                return;
            }

            // CRITICAL FIX: Hide iframe IMMEDIATELY
            iframe.style.display = 'none';
            iframe.style.visibility = 'hidden';
            console.log('[PDF] *** IFRAME HIDDEN IMMEDIATELY ***');

            const pdfUrl = URLExtractor.extractURL(iframe.src);
            if (!pdfUrl) {
                console.log('[PDF] Could not extract PDF URL');
                iframe.style.display = 'block';
                iframe.style.visibility = 'visible';
                return;
            }

            const wrapper = this.createFacade(iframe, pdfUrl);
            iframe.parentNode.insertBefore(wrapper, iframe);

            wrapper.dataset.iframeId = this.generateUID();
            
            this.pdfContainers.push({
                id: wrapper.dataset.iframeId,
                wrapper: wrapper,
                iframe: iframe,
                pdfUrl: pdfUrl,
                isLoaded: false,
            });

            console.log('[PDF] Facade created');
        }

        createFacade(iframe, pdfUrl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-facade-wrapper';

            const width = iframe.style.width || '100%';
            const height = iframe.style.height || '600px';

            let downloadBtn = '';
            if (this.options.enableDownload) {
                console.log('[PDF] Creating download button');
                downloadBtn = `<button class="pdf-download-button" type="button" style="
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
                </button>`;
            }

            wrapper.innerHTML = `
                <div class="pdf-facade-container" style="
                    width: 100%;
                    max-width: 100%;
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
                        ">Click the button below to load</p>

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
                    </div>
                </div>
            `;

            this.addSpinnerAnimation();

            const viewBtn = wrapper.querySelector('.pdf-view-button');
            const dlBtn = wrapper.querySelector('.pdf-download-button');

            viewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[PDF] View button clicked');
                this.loadPDF(wrapper.dataset.iframeId);
            });

            if (dlBtn) {
                dlBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PDF] Download button clicked');
                    this.downloadPDF(pdfUrl);
                });
            }

            viewBtn.addEventListener('mouseenter', (e) => {
                e.target.style.background = this.options.buttonColorHover;
                e.target.style.transform = 'translateY(-2px)';
            });
            viewBtn.addEventListener('mouseleave', (e) => {
                e.target.style.background = this.options.buttonColor;
                e.target.style.transform = 'translateY(0)';
            });

            return wrapper;
        }

        loadPDF(wrapperId) {
            console.log('[PDF] loadPDF called');

            const pdfEntry = this.pdfContainers.find((p) => p.id === wrapperId);
            if (!pdfEntry) {
                console.log('[PDF] Entry not found');
                return;
            }

            if (pdfEntry.isLoaded) {
                console.log('[PDF] Already loaded');
                this.showPDF(pdfEntry);
                return;
            }

            const wrapper = pdfEntry.wrapper;
            const buttons = wrapper.querySelector('.pdf-facade-buttons');
            const loadingIndicator = wrapper.querySelector('.pdf-loading-indicator');

            buttons.style.display = 'none';
            loadingIndicator.style.display = 'block';

            console.log('[PDF] Starting loading animation: ' + this.options.loadingTime + 'ms');

            setTimeout(() => {
                console.log('[PDF] Loading complete');
                pdfEntry.isLoaded = true;
                this.showPDF(pdfEntry);
            }, this.options.loadingTime);
        }

        showPDF(pdfEntry) {
            console.log('[PDF] Showing PDF');

            const wrapper = pdfEntry.wrapper;
            const iframe = pdfEntry.iframe;

            wrapper.style.display = 'none';
            iframe.style.display = 'block';
            iframe.style.visibility = 'visible';

            console.log('[PDF] *** IFRAME SHOWN ***');

            setTimeout(() => {
                iframe.dispatchEvent(new Event('resize'));
            }, 100);
        }

        downloadPDF(pdfUrl) {
            console.log('[PDF] Download initiated');

            if (!pdfUrl) return;

            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = 'document.pdf';
            link.click();
        }

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

                @media (prefers-color-scheme: dark) {
                    .pdf-facade-container {
                        background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                        border-color: #444;
                    }
                    .pdf-facade-title {
                        color: #fff !important;
                    }
                    .pdf-facade-subtitle, .pdf-loading-text {
                        color: #bbb !important;
                    }
                }

                @media (max-width: 600px) {
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

        generateUID() {
            return 'pdf-' + Math.random().toString(36).substr(2, 9);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            try {
                const data = typeof pdfLazyLoaderData !== 'undefined' ? pdfLazyLoaderData : {};
                console.log('[PDF] Initializing with data:', data);
                new PDFLazyLoader(data);
            } catch (e) {
                console.error('[PDF] Error:', e);
            }
        });
    } else {
        try {
            const data = typeof pdfLazyLoaderData !== 'undefined' ? pdfLazyLoaderData : {};
            console.log('[PDF] Initializing with data:', data);
            new PDFLazyLoader(data);
        } catch (e) {
            console.error('[PDF] Error:', e);
        }
    }

    window.PDFLazyLoader = PDFLazyLoader;
})();
