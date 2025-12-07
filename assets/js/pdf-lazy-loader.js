/**
 * PDF Lazy Loader - Frontend Script
 * Handles lazy loading of PDF iframes
 */

(function() {
    'use strict';

    // Get options from WordPress
    const getOptions = () => {
        if (typeof pdfLazyLoaderData !== 'undefined' && pdfLazyLoaderData) {
            return pdfLazyLoaderData;
        }
        // Default fallback
        return {
            buttonColor: '#FF6B6B',
            buttonColorHover: '#E63946',
            loadingTime: 1500,
            enableDownload: false
        };
    };

    class PDFLazyLoader {
        constructor() {
            this.options = getOptions();
            this.version = '1.0.5';
            console.log('[PDF] Initializing v' + this.version);
            console.log('[PDF] Options:', this.options);
            this.init();
        }

        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.processPDFs());
            } else {
                this.processPDFs();
            }
        }

        processPDFs() {
            console.log('[PDF] Finding PDF iframes...');
            
            // Find all iframes that might contain PDFs
            const iframes = document.querySelectorAll('iframe[src*=".pdf"], iframe[src*="application/pdf"], iframe[type="application/pdf"]');
            
            console.log('[PDF] Found ' + iframes.length + ' iframe(s)');

            iframes.forEach((iframe, index) => {
                console.log('[PDF] Processing iframe ' + (index + 1) + '...');
                this.processIframe(iframe);
            });
        }

        processIframe(iframe) {
            const pdfUrl = iframe.getAttribute('src');
            
            if (!pdfUrl) {
                console.log('[PDF] No src attribute found, skipping');
                return;
            }

            console.log('[PDF] *** IFRAME HIDDEN IMMEDIATELY ***');
            // Hide iframe immediately to prevent background loading
            iframe.style.display = 'none';
            iframe.style.visibility = 'hidden';
            iframe.style.position = 'absolute';
            iframe.style.width = '0';
            iframe.style.height = '0';

            // Get iframe dimensions
            const width = iframe.getAttribute('width') || iframe.style.width || '100%';
            const height = iframe.getAttribute('height') || iframe.style.height || '600px';

            // Create facade wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-facade-wrapper';
            wrapper.style.cssText = `
                width: ${width};
                margin: 0 auto 20px;
                position: relative;
            `;

            // Create facade container
            const facade = document.createElement('div');
            facade.className = 'pdf-facade-container';
            facade.style.cssText = `
                width: 100%;
                height: ${height};
                border: 1px solid #ddd;
                border-radius: 8px;
                background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            // Create facade content
            const content = document.createElement('div');
            content.className = 'pdf-facade-content';
            content.style.cssText = `
                position: relative;
                z-index: 1;
                text-align: center;
                padding: 40px 20px;
            `;

            // PDF Icon
            const icon = document.createElement('div');
            icon.className = 'pdf-facade-icon';
            icon.style.cssText = 'margin-bottom: 20px;';
            icon.innerHTML = `
                <svg width="64" height="80" viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="4" y="4" width="56" height="72" rx="2" fill="${this.options.buttonColor}" stroke="#C92A2A" stroke-width="2"/>
                    <text x="32" y="48" font-size="24" font-weight="bold" fill="white" text-anchor="middle">PDF</text>
                </svg>
            `;

            // Title
            const title = document.createElement('h3');
            title.className = 'pdf-facade-title';
            title.style.cssText = `
                margin: 0 0 10px 0;
                color: #333;
                font-size: 18px;
                font-weight: 600;
            `;
            title.textContent = 'PDF Document';

            // Subtitle
            const subtitle = document.createElement('p');
            subtitle.className = 'pdf-facade-subtitle';
            subtitle.style.cssText = `
                margin: 0 0 20px 0;
                color: #666;
                font-size: 14px;
            `;
            subtitle.textContent = 'Click the button below to load';

            // Buttons container
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'pdf-facade-buttons';
            buttonsContainer.style.cssText = `
                display: flex;
                gap: 10px;
                justify-content: center;
                flex-wrap: wrap;
            `;

            // View PDF button
            const viewButton = document.createElement('button');
            viewButton.className = 'pdf-view-button';
            viewButton.type = 'button';
            viewButton.textContent = '📖 View PDF';
            viewButton.style.cssText = `
                padding: 12px 24px;
                background: ${this.options.buttonColor};
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            `;

            // Hover effects
            viewButton.addEventListener('mouseenter', () => {
                viewButton.style.background = this.options.buttonColorHover;
                viewButton.style.transform = 'translateY(-2px)';
            });
            viewButton.addEventListener('mouseleave', () => {
                viewButton.style.background = this.options.buttonColor;
                viewButton.style.transform = 'translateY(0)';
            });

            // Click handler
            viewButton.addEventListener('click', () => {
                console.log('[PDF] View button clicked');
                this.loadPDF(iframe, facade, pdfUrl);
            });

            buttonsContainer.appendChild(viewButton);

            // Download button (if enabled)
            if (this.options.enableDownload) {
                console.log('[PDF] Download enabled: true');
                const downloadButton = document.createElement('a');
                downloadButton.className = 'pdf-download-button';
                downloadButton.textContent = '⬇️ Download';
                downloadButton.href = pdfUrl;
                downloadButton.download = '';
                downloadButton.style.cssText = `
                    padding: 12px 24px;
                    background: transparent;
                    color: ${this.options.buttonColor};
                    border: 2px solid ${this.options.buttonColor};
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    transition: all 0.3s ease;
                    display: inline-block;
                `;

                downloadButton.addEventListener('mouseenter', () => {
                    downloadButton.style.background = this.options.buttonColor;
                    downloadButton.style.color = 'white';
                });
                downloadButton.addEventListener('mouseleave', () => {
                    downloadButton.style.background = 'transparent';
                    downloadButton.style.color = this.options.buttonColor;
                });

                buttonsContainer.appendChild(downloadButton);
            } else {
                console.log('[PDF] Download enabled: false');
            }

            // Assemble facade
            content.appendChild(icon);
            content.appendChild(title);
            content.appendChild(subtitle);
            content.appendChild(buttonsContainer);
            facade.appendChild(content);
            wrapper.appendChild(facade);

            // Insert facade before iframe
            iframe.parentNode.insertBefore(wrapper, iframe);

            console.log('[PDF] Facade created');
        }

        loadPDF(iframe, facade, pdfUrl) {
            console.log('[PDF] loadPDF called');
            console.log('[PDF] Starting loading animation: ' + this.options.loadingTime + 'ms');

            // Show loading state
            const loadingText = document.createElement('div');
            loadingText.className = 'pdf-loading-text';
            loadingText.textContent = 'Loading PDF...';
            loadingText.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: ${this.options.buttonColor};
                font-size: 18px;
                font-weight: 600;
                z-index: 10;
            `;
            facade.appendChild(loadingText);

            // Hide buttons
            const buttonsContainer = facade.querySelector('.pdf-facade-buttons');
            if (buttonsContainer) {
                buttonsContainer.style.opacity = '0.3';
            }

            // After loading time, show iframe
            setTimeout(() => {
                console.log('[PDF] IFRAME SHOWN');
                
                // Remove facade
                facade.remove();
                
                // Show and restore iframe
                iframe.style.display = '';
                iframe.style.visibility = '';
                iframe.style.position = '';
                iframe.style.width = '';
                iframe.style.height = '';
                
                // Ensure iframe is visible
                const wrapper = iframe.parentNode.querySelector('.pdf-facade-wrapper');
                if (wrapper) {
                    wrapper.remove();
                }
            }, this.options.loadingTime);
        }
    }

    // Initialize when document is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.PDFLazyLoader = new PDFLazyLoader();
        });
    } else {
        window.PDFLazyLoader = new PDFLazyLoader();
    }
})();
