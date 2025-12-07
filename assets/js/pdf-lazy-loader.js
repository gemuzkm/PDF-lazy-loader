/**
 * PDF Lazy Loader - Admin Settings Script v1.0.5
 * Fixed: Proper variable handling for WordPress admin
 */

(function() {
    'use strict';

    // Safe variable access with fallback
    const getOptions = () => {
        // Try multiple sources for the data
        if (typeof pdfLazyLoaderAdmin !== 'undefined' && pdfLazyLoaderAdmin) {
            return pdfLazyLoaderAdmin;
        }
        
        // Fallback: Try to get from data attribute
        const settingsElement = document.querySelector('[data-pdf-lazy-loader-settings]');
        if (settingsElement && settingsElement.dataset.pdfLazyLoaderSettings) {
            try {
                return JSON.parse(settingsElement.dataset.pdfLazyLoaderSettings);
            } catch (e) {
                console.log('[PDF Admin] Could not parse settings data');
            }
        }

        // Default empty object
        return {};
    };

    class PDFLazyLoaderAdmin {
        constructor() {
            this.options = getOptions();
            console.log('[PDF Admin] Initialized');
            this.init();
        }

        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupPreview());
            } else {
                this.setupPreview();
            }
        }

        setupPreview() {
            console.log('[PDF Admin] Setting up preview');
            const previewContainer = document.getElementById('pdf-lazy-loader-preview');
            
            if (!previewContainer) {
                console.log('[PDF Admin] Preview container not found');
                return;
            }

            // Create sample PDF with facade
            const sampleHTML = `
                <div class="pdf-facade-wrapper" style="width: 100%; margin-bottom: 0;">
                    <div class="pdf-facade-container" style="
                        width: 100%;
                        height: 400px;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
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
                                    <rect x="4" y="4" width="56" height="72" rx="2" fill="${this.options.buttonColor || '#FF6B6B'}" stroke="#C92A2A" stroke-width="2"/>
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

                            <div class="pdf-facade-buttons" style="
                                display: flex;
                                gap: 10px;
                                justify-content: center;
                                flex-wrap: wrap;
                            ">
                                <button class="pdf-view-button" type="button" style="
                                    padding: 12px 24px;
                                    background: ${this.options.buttonColor || '#FF6B6B'};
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
                            </div>
                        </div>
                    </div>
                </div>
            `;

            previewContainer.innerHTML = sampleHTML;
            console.log('[PDF Admin] Preview created');

            // Add preview button handler
            const viewBtn = previewContainer.querySelector('.pdf-view-button');
            if (viewBtn) {
                viewBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    alert('In the frontend, this would load the actual PDF. Button color: ' + (this.options.buttonColor || '#FF6B6B'));
                });

                viewBtn.addEventListener('mouseenter', (e) => {
                    e.target.style.background = this.options.buttonColorHover || '#E63946';
                    e.target.style.transform = 'translateY(-2px)';
                });
                viewBtn.addEventListener('mouseleave', (e) => {
                    e.target.style.background = this.options.buttonColor || '#FF6B6B';
                    e.target.style.transform = 'translateY(0)';
                });
            }
        }
    }

    // Initialize when document is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[PDF Admin] DOM Content Loaded');
            new PDFLazyLoaderAdmin();
        });
    } else {
        console.log('[PDF Admin] Document already loaded');
        new PDFLazyLoaderAdmin();
    }

    // Export for global access
    window.PDFLazyLoaderAdmin = PDFLazyLoaderAdmin;
})();
