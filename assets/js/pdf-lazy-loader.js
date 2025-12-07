/**
 * PDF Lazy Loader - Frontend Script
 * Handles lazy loading of PDF iframes
 * Improved to catch all PDF iframes including dynamically created ones
 */

(function() {
    'use strict';

    // Get options from WordPress
    const getOptions = () => {
        if (typeof pdfLazyLoaderData !== 'undefined' && pdfLazyLoaderData) {
            // Convert enableDownload to boolean if it's a string
            const options = { ...pdfLazyLoaderData };
            if (typeof options.enableDownload === 'string') {
                options.enableDownload = options.enableDownload === '1' || options.enableDownload === 'true';
            }
            // Convert loadingTime to number if it's a string
            if (typeof options.loadingTime === 'string') {
                options.loadingTime = parseInt(options.loadingTime, 10) || 1500;
            }
            return options;
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
            this.version = '1.0.6';
            this.processedIframes = new WeakSet(); // Track processed iframes
            console.log('[PDF] Initializing v' + this.version);
            console.log('[PDF] Options:', this.options);
            this.init();
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

            // Also process after a short delay to catch late-loading iframes
            setTimeout(() => this.processPDFs(), 500);
            setTimeout(() => this.processPDFs(), 1500);
        }

        /**
         * Check if an iframe contains a PDF
         */
        isPDFIframe(iframe) {
            // Skip if already processed (has our wrapper nearby)
            if (iframe.parentElement && 
                (iframe.parentElement.querySelector('.pdf-lazy-loader-wrapper') || 
                 iframe.nextElementSibling?.classList?.contains('pdf-lazy-loader-wrapper'))) {
                return false;
            }

            const src = iframe.getAttribute('src') || '';
            const dataSrc = iframe.getAttribute('data-src') || '';
            const className = iframe.className || '';
            const id = iframe.id || '';

            // Check src for PDF indicators
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

            // Check if src contains PDF indicators
            for (const indicator of pdfIndicators) {
                if (lowerSrc.includes(indicator)) {
                    return true;
                }
            }

            // Check class names for PDF embedder indicators
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

            // Check if iframe is inside a PDF container
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

        /**
         * Extract PDF URL from iframe
         */
        extractPDFUrl(iframe) {
            // First check if src was intercepted and saved
            let pdfUrl = iframe.getAttribute('data-pdf-lazy-original-src') || 
                        iframe.getAttribute('src') || 
                        iframe.getAttribute('data-src') || 
                        '';

            // Check for PDFEmbedder format: ?pdfemb-data=base64encoded
            if (pdfUrl.includes('pdfemb-data')) {
                try {
                    const url = new URL(pdfUrl, window.location.href);
                    const pdfembData = url.searchParams.get('pdfemb-data');
                    if (pdfembData) {
                        // Decode base64
                        const decoded = atob(pdfembData);
                        const data = JSON.parse(decoded);
                        if (data.url) {
                            pdfUrl = data.url;
                            console.log('[PDF] Extracted PDF URL from pdfemb-data:', pdfUrl);
                        } else {
                            console.log('[PDF] pdfemb-data decoded but no URL found:', data);
                        }
                    }
                } catch (e) {
                    console.log('[PDF] Could not parse pdfemb-data:', e);
                    // Keep original URL if decoding fails
                }
            }

            // If URL contains viewer.html or similar, try to extract actual PDF URL
            if (pdfUrl.includes('viewer.html') || pdfUrl.includes('pdfjs')) {
                // Try to get PDF URL from URL parameters
                try {
                    const url = new URL(pdfUrl, window.location.href);
                    const fileParam = url.searchParams.get('file') || 
                                    url.searchParams.get('url') ||
                                    url.searchParams.get('src');
                    if (fileParam) {
                        pdfUrl = decodeURIComponent(fileParam);
                    }
                } catch (e) {
                    console.log('[PDF] Could not parse PDF URL from viewer:', e);
                }
            }

            // If still no URL, check data attributes
            if (!pdfUrl || pdfUrl.includes('pdfemb-data')) {
                pdfUrl = iframe.getAttribute('data-pdf-url') || 
                        iframe.getAttribute('data-url') ||
                        iframe.getAttribute('data-pdfemb-url') ||
                        '';
            }

            return pdfUrl;
        }

        processPDFs() {
            console.log('[PDF] Finding PDF iframes...');
            
            // Find ALL iframes first
            const allIframes = document.querySelectorAll('iframe');
            console.log('[PDF] Found ' + allIframes.length + ' total iframe(s)');

            let pdfIframes = [];

            // Check each iframe to see if it's a PDF
            allIframes.forEach((iframe) => {
                // Skip if already processed
                if (this.processedIframes.has(iframe)) {
                    return;
                }

                // Check if this is a PDF iframe
                if (this.isPDFIframe(iframe)) {
                    pdfIframes.push(iframe);
                }
            });

            console.log('[PDF] Found ' + pdfIframes.length + ' PDF iframe(s)');

            pdfIframes.forEach((iframe, index) => {
                console.log('[PDF] Processing PDF iframe ' + (index + 1) + '...');
                this.processIframe(iframe);
            });
        }

        /**
         * Setup MutationObserver to catch dynamically added iframes
         */
        setupMutationObserver() {
            const observer = new MutationObserver((mutations) => {
                let shouldProcess = false;

                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            // Check if the added node is an iframe
                            if (node.tagName === 'IFRAME') {
                                shouldProcess = true;
                            }
                            // Check if the added node contains iframes
                            if (node.querySelectorAll && node.querySelectorAll('iframe').length > 0) {
                                shouldProcess = true;
                            }
                        }
                    });
                });

                if (shouldProcess) {
                    console.log('[PDF] New iframes detected, processing...');
                    setTimeout(() => this.processPDFs(), 100);
                }
            });

            // Observe the entire document
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            console.log('[PDF] MutationObserver setup complete');
        }

        processIframe(iframe) {
            // Mark as processed
            this.processedIframes.add(iframe);

            // Get original src - check if it was intercepted by inline script
            let originalSrc = iframe.getAttribute('data-pdf-lazy-original-src') || 
                            iframe.getAttribute('src') || 
                            '';
            
            // If intercepted, remove the marker
            if (iframe.hasAttribute('data-pdf-lazy-intercepted')) {
                iframe.removeAttribute('data-pdf-lazy-intercepted');
            }
            
            // Get iframe dimensions BEFORE doing anything else!
            const computedStyle = window.getComputedStyle(iframe);
            let width = iframe.getAttribute('width') || '';
            let height = iframe.getAttribute('height') || '';
            
            // Get actual rendered dimensions first
            const offsetWidth = iframe.offsetWidth;
            const offsetHeight = iframe.offsetHeight;
            
            console.log('[PDF] Iframe raw dimensions - offsetWidth:', offsetWidth, 'offsetHeight:', offsetHeight);
            console.log('[PDF] Iframe attributes - width:', iframe.getAttribute('width'), 'height:', iframe.getAttribute('height'));
            console.log('[PDF] Iframe computed - width:', computedStyle.width, 'height:', computedStyle.height);
            
            // Priority: offsetWidth/offsetHeight > attributes > computed style > defaults
            if (offsetWidth > 10) { // Use offsetWidth if it's reasonable (more than 10px)
                width = offsetWidth + 'px';
            } else if (width && width !== 'auto' && width !== '0px' && width !== '1px') {
                // Use attribute if valid and not 1px
            } else if (computedStyle.width && computedStyle.width !== 'auto' && computedStyle.width !== '0px' && computedStyle.width !== '1px') {
                width = computedStyle.width;
            } else {
                // Check parent container width
                const parent = iframe.parentElement;
                if (parent) {
                    const parentOffsetWidth = parent.offsetWidth;
                    const parentComputedWidth = window.getComputedStyle(parent).width;
                    // Use offsetWidth if available and valid, otherwise use computed width
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
                // Use attribute if valid and not 1px
            } else if (computedStyle.height && computedStyle.height !== 'auto' && computedStyle.height !== '0px' && computedStyle.height !== '1px') {
                height = computedStyle.height;
            } else {
                height = '600px'; // Default height
            }

            // Ensure we have valid dimensions with proper units
            // Normalize width: ensure it has a unit or is a percentage
            if (!width || width === '0px' || width === 'auto' || width === '1px') {
                width = '100%';
            } else if (typeof width === 'number') {
                width = width + 'px';
            } else if (!width.includes('%') && !width.includes('px') && !width.includes('em') && !width.includes('rem')) {
                // If width is a number without unit, add 'px'
                const numWidth = parseFloat(width);
                if (!isNaN(numWidth)) {
                    width = numWidth + 'px';
                } else {
                    width = '100%';
                }
            }
            
            // Normalize height: ensure it has a unit
            if (!height || height === '0px' || height === 'auto' || height === '1px') {
                height = '600px';
            } else if (typeof height === 'number') {
                height = height + 'px';
            } else if (!height.includes('%') && !height.includes('px') && !height.includes('em') && !height.includes('rem')) {
                // If height is a number without unit, add 'px'
                const numHeight = parseFloat(height);
                if (!isNaN(numHeight)) {
                    height = numHeight + 'px';
                } else {
                    height = '600px';
                }
            }

            console.log('[PDF] Final iframe dimensions - width:', width, 'height:', height);
            
            const pdfUrl = this.extractPDFUrl(iframe);
            
            // If we couldn't extract a different URL, use original src
            // For pdfemb-data URLs, we keep the original src to restore the iframe properly
            const finalPdfUrl = (pdfUrl && pdfUrl !== originalSrc && !pdfUrl.includes('pdfemb-data')) ? pdfUrl : originalSrc;
            
            if (!finalPdfUrl) {
                console.log('[PDF] No valid PDF URL found, skipping');
                console.log('[PDF] Original src:', originalSrc);
                console.log('[PDF] Extracted URL:', pdfUrl);
                return;
            }

            // Log URL information
            console.log('[PDF] URL processing:');
            console.log('[PDF] - Original src:', originalSrc);
            console.log('[PDF] - Extracted URL:', pdfUrl);
            console.log('[PDF] - Final PDF URL:', finalPdfUrl);

            console.log('[PDF] PDF URL:', finalPdfUrl);
            console.log('[PDF] Original src:', originalSrc);
            console.log('[PDF] *** IFRAME HIDDEN IMMEDIATELY ***');

            // Remove src immediately to prevent loading (if not already removed by inline script)
            if (iframe.hasAttribute('src')) {
                iframe.removeAttribute('src');
            }
            
            // Clean up interception markers (keep data-pdf-lazy-original-src for restoration)
            if (iframe.hasAttribute('data-pdf-lazy-intercepted')) {
                iframe.removeAttribute('data-pdf-lazy-intercepted');
            }
            
            // Hide iframe completely - use multiple methods to ensure it's hidden
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
            
            // Also set attributes to prevent any rendering
            iframe.setAttribute('aria-hidden', 'true');
            iframe.setAttribute('tabindex', '-1');

            // Create facade wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-facade-wrapper pdf-lazy-loader-wrapper';
            wrapper.setAttribute('data-pdf-url', finalPdfUrl);
            wrapper.setAttribute('data-original-src', originalSrc); // Store original src
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

            // Create facade container
            const facade = document.createElement('div');
            facade.className = 'pdf-facade-container pdf-lazy-loader-facade';
            facade.style.cssText = `
                width: 100%;
                height: ${height};
                min-height: 400px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
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
            viewButton.className = 'pdf-view-button pdf-lazy-loader-view-btn';
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
                // Get original src from wrapper if available
                const storedOriginalSrc = wrapper.getAttribute('data-original-src') || originalSrc;
                const storedPdfUrl = wrapper.getAttribute('data-pdf-url') || finalPdfUrl;
                this.loadPDF(iframe, facade, storedPdfUrl, storedOriginalSrc, wrapper);
            });

            buttonsContainer.appendChild(viewButton);

            // Download button (if enabled)
            if (this.options.enableDownload) {
                console.log('[PDF] Download enabled: true');
                const downloadButton = document.createElement('a');
                downloadButton.className = 'pdf-download-button pdf-lazy-loader-download-btn';
                downloadButton.textContent = '⬇️ Download';
                downloadButton.href = finalPdfUrl;
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
            if (iframe.parentNode) {
                // Try to insert before iframe
                try {
                    iframe.parentNode.insertBefore(wrapper, iframe);
                    console.log('[PDF] Facade inserted into DOM before iframe');
                } catch (e) {
                    // If insertBefore fails, try appendChild
                    console.log('[PDF] insertBefore failed, trying appendChild:', e);
                    iframe.parentNode.appendChild(wrapper);
                }
            } else {
                console.error('[PDF] Cannot insert facade - iframe has no parent node');
                return;
            }

            // Ensure facade is visible with important flags
            wrapper.style.setProperty('display', 'block', 'important');
            wrapper.style.setProperty('visibility', 'visible', 'important');
            wrapper.style.setProperty('opacity', '1', 'important');
            wrapper.style.setProperty('z-index', '10', 'important');
            wrapper.style.setProperty('position', 'relative', 'important');

            // Verify facade is in DOM and visible
            setTimeout(() => {
                const isInDOM = document.body.contains(wrapper) || iframe.parentNode.contains(wrapper);
                const computedDisplay = window.getComputedStyle(wrapper).display;
                const computedVisibility = window.getComputedStyle(wrapper).visibility;
                const computedOpacity = window.getComputedStyle(wrapper).opacity;
                
                console.log('[PDF] Facade verification:');
                console.log('[PDF] - In DOM:', isInDOM);
                console.log('[PDF] - Display:', computedDisplay);
                console.log('[PDF] - Visibility:', computedVisibility);
                console.log('[PDF] - Opacity:', computedOpacity);
                console.log('[PDF] - Wrapper dimensions:', wrapper.offsetWidth, 'x', wrapper.offsetHeight);
                console.log('[PDF] - Facade dimensions:', facade.offsetWidth, 'x', facade.offsetHeight);
                
                if (!isInDOM || computedDisplay === 'none' || computedVisibility === 'hidden' || computedOpacity === '0') {
                    console.error('[PDF] WARNING: Facade may not be visible!');
                }
            }, 100);

            console.log('[PDF] Facade created and should be visible');
        }

        loadPDF(iframe, facade, pdfUrl, originalSrc, wrapper) {
            console.log('[PDF] loadPDF called');
            console.log('[PDF] Starting loading animation: ' + this.options.loadingTime + 'ms');
            console.log('[PDF] Original src:', originalSrc);
            console.log('[PDF] PDF URL:', pdfUrl);

            // Show loading state with spinner
            const loadingSpinner = document.createElement('div');
            loadingSpinner.className = 'pdf-loading-spinner';
            loadingSpinner.style.color = this.options.buttonColor;
            
            // Create spinner element
            const spinner = document.createElement('div');
            spinner.className = 'pdf-spinner';
            
            // Create loading text (optional, can be removed if not needed)
            const loadingText = document.createElement('div');
            loadingText.className = 'pdf-loading-text';
            loadingText.textContent = 'Loading PDF...';
            
            // Assemble spinner
            loadingSpinner.appendChild(spinner);
            loadingSpinner.appendChild(loadingText);
            
            facade.appendChild(loadingSpinner);

            // Hide buttons
            const buttonsContainer = facade.querySelector('.pdf-facade-buttons');
            if (buttonsContainer) {
                buttonsContainer.style.opacity = '0.3';
            }

            // After loading time, show iframe
            setTimeout(() => {
                console.log('[PDF] IFRAME SHOWN');
                
                // Remove loading spinner
                const spinnerElement = facade.querySelector('.pdf-loading-spinner');
                if (spinnerElement) {
                    spinnerElement.remove();
                }
                
                // Restore buttons opacity
                const buttonsContainer = facade.querySelector('.pdf-facade-buttons');
                if (buttonsContainer) {
                    buttonsContainer.style.opacity = '1';
                }
                
                // Get wrapper if not provided
                if (!wrapper) {
                    wrapper = facade.closest('.pdf-facade-wrapper');
                }
                
                // Get preserved dimensions from wrapper data attributes or computed style
                let wrapperWidth = '';
                let wrapperHeight = '';
                if (wrapper) {
                    // First try to get from data attributes (original dimensions)
                    wrapperWidth = wrapper.getAttribute('data-iframe-width') || '';
                    wrapperHeight = wrapper.getAttribute('data-iframe-height') || '';
                    
                    // If not in data attributes, get from computed style
                    if (!wrapperWidth || !wrapperHeight) {
                        const wrapperComputedStyle = window.getComputedStyle(wrapper);
                        wrapperWidth = wrapperWidth || wrapperComputedStyle.width || wrapper.style.width || '';
                        wrapperHeight = wrapperHeight || wrapperComputedStyle.height || wrapper.style.height || '';
                    }
                    
                    console.log('[PDF] Wrapper dimensions to preserve - width:', wrapperWidth, 'height:', wrapperHeight);
                }
                
                // Restore iframe src - use original src if available, otherwise use extracted PDF URL
                const srcToRestore = originalSrc || pdfUrl;
                console.log('[PDF] Restoring iframe src:', srcToRestore);
                iframe.setAttribute('src', srcToRestore);
                
                // Remove facade and wrapper
                if (wrapper) {
                    // Get wrapper's parent and position before removing
                    const wrapperParent = wrapper.parentNode;
                    const wrapperNextSibling = wrapper.nextSibling;
                    
                    // Remove facade from wrapper
                    const facadeInWrapper = wrapper.querySelector('.pdf-facade-container');
                    if (facadeInWrapper) {
                        facadeInWrapper.remove();
                    }
                    
                    // Remove wrapper but keep reference to its position
                    wrapper.remove();
                    
                    // Insert iframe at wrapper's position
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
                
                // Show and restore iframe with preserved dimensions
                iframe.style.display = '';
                iframe.style.visibility = '';
                iframe.style.position = '';
                iframe.style.opacity = '';
                iframe.style.left = '';
                iframe.style.top = '';
                iframe.style.pointerEvents = '';
                iframe.style.zIndex = '';
                
                // Apply preserved dimensions from wrapper
                if (wrapperWidth) {
                    iframe.style.width = wrapperWidth;
                    // Set width attribute (remove 'px' for attribute)
                    const widthValue = wrapperWidth.replace('px', '').replace('%', '');
                    if (widthValue) {
                        iframe.setAttribute('width', widthValue + (wrapperWidth.includes('%') ? '%' : ''));
                    }
                }
                if (wrapperHeight) {
                    iframe.style.height = wrapperHeight;
                    // Set height attribute (remove 'px' for attribute)
                    const heightValue = wrapperHeight.replace('px', '').replace('%', '');
                    if (heightValue) {
                        iframe.setAttribute('height', heightValue + (wrapperHeight.includes('%') ? '%' : ''));
                    }
                }
                
                // Force reflow to ensure dimensions are applied
                iframe.offsetHeight; // Trigger reflow
                
                // Remove aria-hidden and tabindex
                iframe.removeAttribute('aria-hidden');
                iframe.removeAttribute('tabindex');
                
                console.log('[PDF] Iframe restored and visible');
                console.log('[PDF] Iframe dimensions - width:', iframe.style.width, 'height:', iframe.style.height);
                console.log('[PDF] Iframe offset dimensions - width:', iframe.offsetWidth, 'height:', iframe.offsetHeight);
                
                // Trigger PDFEmbedder reinitialization if available
                if (typeof jQuery !== 'undefined' && jQuery.fn.pdfEmbedder) {
                    console.log('[PDF] Reinitializing PDFEmbedder');
                    try {
                        jQuery(iframe).pdfEmbedder();
                    } catch (e) {
                        console.log('[PDF] PDFEmbedder reinitialization failed:', e);
                    }
                }
                
                // Also try to trigger resize event for PDFEmbedder
                if (typeof window.dispatchEvent !== 'undefined') {
                    window.dispatchEvent(new Event('resize'));
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
