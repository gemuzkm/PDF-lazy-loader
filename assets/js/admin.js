/**
 * PDF Lazy Loader - Admin JavaScript
 * Управление панелью администратора
 */

(function($) {
    'use strict';

    $(document).ready(function() {
        // Инициализация color picker
        initColorPickers();

        // Обработчик сохранения
        handleFormSubmit();

        // Загрузка статистики
        loadStats();

        // Проверка совместимости
        checkCompatibility();

        // Инициализация превью
        initPreview();
        
        // Обновление превью при изменении настроек
        updatePreviewOnChange();
        
        // Автоматическое скрытие уведомлений (только наших, не системных)
        // Запускаем с небольшой задержкой, чтобы не мешать системным уведомлениям
        setTimeout(function() {
            autoHideNotifications();
            removeDuplicateNotifications();
        }, 100);
    });

    /**
     * Инициализация color picker
     */
    function initColorPickers() {
        if (typeof jQuery.wp !== 'undefined' && typeof jQuery.wp.wpColorPicker !== 'undefined') {
            $('input[type="color"]').wpColorPicker();
        }
    }

    /**
     * Обработчик отправки формы
     */
    function handleFormSubmit() {
        $('form').on('submit', function(e) {
            var $form = $(this);
            
            // Проверяем, что это форма настроек плагина
            if (!$form.find('input[name="pdf_lazy_loader_button_color"]').length) {
                return true;
            }
            
            // Валидация цветов
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

            // Валидация времени загрузки
            var loadingTime = parseInt($form.find('input[name="pdf_lazy_loader_loading_time"]').val(), 10);
            if (isNaN(loadingTime) || loadingTime < 500 || loadingTime > 5000) {
                alert('Loading time must be between 500 and 5000 ms');
                e.preventDefault();
                return false;
            }

            return true;
        });
    }

    /**
     * Проверка валидности hex цвета
     */
    function isValidHexColor(color) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    }

    /**
     * Загрузка статистики (опционально, если элемент существует)
     * Note: Statistics feature is disabled as AJAX endpoint is not implemented
     */
    function loadStats() {
        var $statsContainer = $('#pdf-lazy-loader-stats');
        if ($statsContainer.length === 0) return;
        
        // Statistics feature is not implemented - show message or remove this function
        // If you want to implement statistics, you need to:
        // 1. Add AJAX endpoint in PHP
        // 2. Add ajaxUrl and nonce to wp_localize_script
        // 3. Uncomment the AJAX call below
        
        // For now, just show a placeholder message
        $statsContainer.html('<p>Statistics feature is not available.</p>');
        
        /* Uncomment when AJAX endpoint is implemented:
        // Check if AJAX parameters are available
        if (typeof pdfLazyLoaderAdmin === 'undefined' || 
            !pdfLazyLoaderAdmin.ajaxUrl || 
            !pdfLazyLoaderAdmin.nonce) {
            $statsContainer.html('<p>Statistics feature is not configured.</p>');
            return;
        }
        
        $.ajax({
            url: pdfLazyLoaderAdmin.ajaxUrl,
            type: 'POST',
            data: {
                action: 'pdf_lazy_loader_stats',
                nonce: pdfLazyLoaderAdmin.nonce
            },
            success: function(response) {
                if (response.success && response.data && response.data.stats) {
                    renderStats(response.data.stats);
                } else {
                    $statsContainer.html('<p>No statistics available.</p>');
                }
            },
            error: function() {
                $statsContainer.html('<p>Could not load statistics.</p>');
            }
        });
        */
    }

    /**
     * Отрендерить статистику
     */
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

    /**
     * Проверка совместимости (опционально, если элемент существует)
     */
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

    /**
     * Получить текущие настройки из формы
     */
    function getCurrentSettings() {
        return {
            buttonColor: $('input[name="pdf_lazy_loader_button_color"]').val() || '#FF6B6B',
            buttonColorHover: $('input[name="pdf_lazy_loader_button_color_hover"]').val() || '#E63946',
            loadingTime: parseInt($('input[name="pdf_lazy_loader_loading_time"]').val(), 10) || 1500,
            enableDownload: $('input[name="pdf_lazy_loader_enable_download"]').is(':checked')
        };
    }

    /**
     * Инициализация превью
     */
    function initPreview() {
        var $previewContainer = $('#pdf-lazy-loader-preview');
        if ($previewContainer.length === 0) return;

        updatePreview();
    }

    /**
     * Обновление превью при изменении настроек
     */
    function updatePreviewOnChange() {
        $('input[name="pdf_lazy_loader_button_color"], input[name="pdf_lazy_loader_button_color_hover"], input[name="pdf_lazy_loader_loading_time"], input[name="pdf_lazy_loader_enable_download"]').on('change input', function() {
            updatePreview();
        });
    }

    /**
     * Обновить превью
     */
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

        // Add preview button handlers
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

    /**
     * Автоматическое скрытие уведомлений через 5 секунд
     * Исключаем системные уведомления WordPress (REST API, etc.)
     */
    function autoHideNotifications() {
        $('.notice, .updated, .error').each(function() {
            var $notice = $(this);
            var noticeText = $notice.text().trim();
            
            // Пропускаем системные уведомления WordPress (REST API, security warnings, etc.)
            if (noticeText.includes('REST API') || 
                noticeText.includes('WordPress REST API') ||
                noticeText.includes('network error') ||
                noticeText.includes('security plugin') ||
                noticeText.includes('web server configuration') ||
                noticeText.includes('ad-blocker extension')) {
                // Не скрываем системные уведомления
                return;
            }
            
            // Показываем уведомление с анимацией
            $notice.fadeIn();
            
            // Автоматически скрываем через 5 секунд только наши уведомления
            setTimeout(function() {
                $notice.fadeOut(300, function() {
                    $(this).remove();
                });
            }, 5000);
        });
    }

    /**
     * Удаление дублирующихся уведомлений
     * Исключаем системные уведомления WordPress
     */
    function removeDuplicateNotifications() {
        var seenTexts = {};
        $('.notice, .updated, .error').each(function() {
            var $notice = $(this);
            var noticeText = $notice.text().trim();
            
            // Пропускаем системные уведомления WordPress
            if (noticeText.includes('REST API') || 
                noticeText.includes('WordPress REST API') ||
                noticeText.includes('network error') ||
                noticeText.includes('security plugin') ||
                noticeText.includes('web server configuration') ||
                noticeText.includes('ad-blocker extension')) {
                // Не удаляем системные уведомления
                return;
            }
            
            // Если уведомление с таким текстом уже видели, удаляем дубликат
            if (seenTexts[noticeText]) {
                $notice.remove();
            } else {
                seenTexts[noticeText] = true;
            }
        });
    }

})(jQuery);
