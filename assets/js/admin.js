

(function($) {
    'use strict';

    $(document).ready(function() {
        initColorPickers();

        handleFormSubmit();

        loadStats();

        checkCompatibility();

        initPreview();
        
        updatePreviewOnChange();
        
        setTimeout(function() {
            autoHideNotifications();
            removeDuplicateNotifications();
        }, 100);
    });


    function initColorPickers() {
        if (typeof jQuery.wp !== 'undefined' && typeof jQuery.wp.wpColorPicker !== 'undefined') {
            $('input[type="color"]').wpColorPicker();
        }
    }


    function handleFormSubmit() {
        $('form').on('submit', function(e) {
            var $form = $(this);
            
            if (!$form.find('input[name="pdf_lazy_loader_button_color"]').length) {
                return true;
            }
            
            var buttonColor = $form.find('input[name="pdf_lazy_loader_button_color"]').val();
            if (buttonColor && !isValidHexColor(buttonColor)) {
                alert('Invalid button color');
                e.preventDefault();
                return false;
            }

            var buttonColorHover = $form.find('input[name="pdf_lazy_loader_button_color_hover"]').val();
            if (buttonColorHover && !isValidHexColor(buttonColorHover)) {
                alert('Invalid button hover color');
                e.preventDefault();
                return false;
            }

            var loadingTime = parseInt($form.find('input[name="pdf_lazy_loader_loading_time"]').val(), 10);
            if (isNaN(loadingTime) || loadingTime < 500 || loadingTime > 5000) {
                alert('Loading time must be between 500 and 5000 ms');
                e.preventDefault();
                return false;
            }

            return true;
        });
    }


    function isValidHexColor(color) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    }


    function loadStats() {
        var $statsContainer = $('#pdf-lazy-loader-stats');
        if ($statsContainer.length === 0) return;
        
        
        $statsContainer.html('<p>Statistics feature is not available.</p>');
        

    }


    function renderStats(stats) {
        var $statsContainer = $('#pdf-lazy-loader-stats');
        if ($statsContainer.length === 0) return;

        var html = '<h3>Top PDF Files</h3><ul>';
        
        if (stats.length === 0) {
            html += '<li>No statistics available yet</li>';
        } else {
            stats.forEach(function(stat) {
                html += '<li>' + stat.pdf_url + ' - ' + stat.views + ' views</li>';
            });
        }

        html += '</ul>';
        $statsContainer.html(html);
    }


    function checkCompatibility() {
        var $status = $('#pdf-lazy-loader-compatibility-status');
        if ($status.length === 0) return;

        var html = '<h3>Compatibility Status</h3>';
        html += '<ul>';
        
        if (typeof pdfLazyLoaderAdmin !== 'undefined') {
            html += '<li>Redis Cache: ' + (pdfLazyLoaderAdmin.redisEnabled ? '✓ Active' : '✗ Inactive') + '</li>';
            html += '<li>FlyingPress: ' + (pdfLazyLoaderAdmin.flyingPressEnabled ? '✓ Active' : '✗ Inactive') + '</li>';
        } else {
            html += '<li>Compatibility check not available</li>';
        }
        
        html += '</ul>';

        $status.html(html);
    }


    function getCurrentSettings() {
        return {
            buttonColor: $('input[name="pdf_lazy_loader_button_color"]').val() || '#FF6B6B',
            buttonColorHover: $('input[name="pdf_lazy_loader_button_color_hover"]').val() || '#E63946',
            loadingTime: parseInt($('input[name="pdf_lazy_loader_loading_time"]').val(), 10) || 1500,
            enableDownload: $('input[name="pdf_lazy_loader_enable_download"]').is(':checked')
        };
    }


    function initPreview() {
        var $previewContainer = $('#pdf-lazy-loader-preview');
        if ($previewContainer.length === 0) return;

        updatePreview();
    }


    function updatePreviewOnChange() {
        $('input[name="pdf_lazy_loader_button_color"], input[name="pdf_lazy_loader_button_color_hover"], input[name="pdf_lazy_loader_loading_time"], input[name="pdf_lazy_loader_enable_download"]').on('change input', function() {
            updatePreview();
        });
    }


    function updatePreview() {
        var $previewContainer = $('#pdf-lazy-loader-preview');
        if ($previewContainer.length === 0) return;

        var settings = getCurrentSettings();

        var sampleHTML = '<div class="pdf-facade-wrapper" style="width: 100%; margin-bottom: 0;">' +
            '<div class="pdf-facade-container" style="' +
            'width: 100%;' +
            'height: 400px;' +
            'border: 1px solid #ddd;' +
            'border-radius: 4px;' +
            'background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);' +
            'display: flex;' +
            'flex-direction: column;' +
            'align-items: center;' +
            'justify-content: center;' +
            'position: relative;' +
            'overflow: hidden;' +
            'font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;' +
            '">' +
            '<div class="pdf-facade-content" style="' +
            'position: relative;' +
            'z-index: 1;' +
            'text-align: center;' +
            'padding: 40px 20px;' +
            '">' +
            '<div class="pdf-facade-icon" style="margin-bottom: 20px;">' +
            '<svg width="64" height="80" viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="4" y="4" width="56" height="72" rx="2" fill="' + settings.buttonColor + '" stroke="#C92A2A" stroke-width="2"/>' +
            '<text x="32" y="48" font-size="24" font-weight="bold" fill="white" text-anchor="middle">PDF</text>' +
            '</svg>' +
            '</div>' +
            '<h3 class="pdf-facade-title" style="' +
            'margin: 0 0 10px 0;' +
            'color: #333;' +
            'font-size: 18px;' +
            'font-weight: 600;' +
            '">PDF Document</h3>' +
            '<p class="pdf-facade-subtitle" style="' +
            'margin: 0 0 20px 0;' +
            'color: #666;' +
            'font-size: 14px;' +
            '">Click the button below to load</p>' +
            '<div class="pdf-facade-buttons" style="' +
            'display: flex;' +
            'gap: 10px;' +
            'justify-content: center;' +
            'flex-wrap: wrap;' +
            '">' +
            '<button class="pdf-view-button" type="button" style="' +
            'padding: 12px 24px;' +
            'background: ' + settings.buttonColor + ';' +
            'color: white;' +
            'border: none;' +
            'border-radius: 4px;' +
            'font-size: 14px;' +
            'font-weight: 600;' +
            'cursor: pointer;' +
            'transition: all 0.3s ease;' +
            '">📖 View PDF</button>';

        if (settings.enableDownload) {
            sampleHTML += '<a class="pdf-download-button" href="#" style="' +
                'padding: 12px 24px;' +
                'background: transparent;' +
                'color: ' + settings.buttonColor + ';' +
                'border: 2px solid ' + settings.buttonColor + ';' +
                'border-radius: 4px;' +
                'font-size: 14px;' +
                'font-weight: 600;' +
                'cursor: pointer;' +
                'text-decoration: none;' +
                'transition: all 0.3s ease;' +
                'display: inline-block;' +
                '">⬇️ Download</a>';
        }

        sampleHTML += '</div></div></div></div>';

        $previewContainer.html(sampleHTML);

        var $viewBtn = $previewContainer.find('.pdf-view-button');
        if ($viewBtn.length) {
            $viewBtn.off('mouseenter mouseleave click').on('mouseenter', function() {
                $(this).css({
                    'background': settings.buttonColorHover,
                    'transform': 'translateY(-2px)'
                });
            }).on('mouseleave', function() {
                $(this).css({
                    'background': settings.buttonColor,
                    'transform': 'translateY(0)'
                });
            }).on('click', function(e) {
                e.preventDefault();
                alert('In the frontend, this would load the actual PDF. Button color: ' + settings.buttonColor);
            });
        }

        var $downloadBtn = $previewContainer.find('.pdf-download-button');
        if ($downloadBtn.length) {
            $downloadBtn.off('mouseenter mouseleave click').on('mouseenter', function() {
                $(this).css({
                    'background': settings.buttonColor,
                    'color': 'white'
                });
            }).on('mouseleave', function() {
                $(this).css({
                    'background': 'transparent',
                    'color': settings.buttonColor
                });
            }).on('click', function(e) {
                e.preventDefault();
                alert('In the frontend, this would download the PDF file.');
            });
        }
    }


    function autoHideNotifications() {
        $('.notice, .updated, .error').each(function() {
            var $notice = $(this);
            var noticeText = $notice.text().trim();
            
            if (noticeText.includes('REST API') || 
                noticeText.includes('WordPress REST API') ||
                noticeText.includes('network error') ||
                noticeText.includes('security plugin') ||
                noticeText.includes('web server configuration') ||
                noticeText.includes('ad-blocker extension')) {
                return;
            }
            
            $notice.fadeIn();
            
            setTimeout(function() {
                $notice.fadeOut(300, function() {
                    $(this).remove();
                });
            }, 5000);
        });
    }


    function removeDuplicateNotifications() {
        var seenTexts = {};
        $('.notice, .updated, .error').each(function() {
            var $notice = $(this);
            var noticeText = $notice.text().trim();
            
            if (noticeText.includes('REST API') || 
                noticeText.includes('WordPress REST API') ||
                noticeText.includes('network error') ||
                noticeText.includes('security plugin') ||
                noticeText.includes('web server configuration') ||
                noticeText.includes('ad-blocker extension')) {
                return;
            }
            
            if (seenTexts[noticeText]) {
                $notice.remove();
            } else {
                seenTexts[noticeText] = true;
            }
        });
    }

})(jQuery);
