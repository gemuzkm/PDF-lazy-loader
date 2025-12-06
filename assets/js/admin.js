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
        $('#pdf-lazy-loader-settings-form').on('submit', function(e) {
            var $form = $(this);
            
            // Валидация цветов
            var buttonColor = $form.find('input[name="pdf_lazy_loader_settings[button_color]"]').val();
            if (!isValidHexColor(buttonColor)) {
                alert('Invalid button color');
                e.preventDefault();
                return false;
            }

            // Валидация времени загрузки
            var loadingTime = $form.find('input[name="pdf_lazy_loader_settings[loading_time]"]').val();
            if (loadingTime < 500 || loadingTime > 5000) {
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
     * Загрузка статистики
     */
    function loadStats() {
        $.ajax({
            url: pdfLazyLoaderAdmin.ajaxUrl,
            type: 'POST',
            data: {
                action: 'pdf_lazy_loader_stats',
                nonce: pdfLazyLoaderAdmin.nonce
            },
            success: function(response) {
                if (response.success && response.data.stats) {
                    renderStats(response.data.stats);
                }
            },
            error: function() {
                console.log('Could not load statistics');
            }
        });
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
     * Проверка совместимости
     */
    function checkCompatibility() {
        var $status = $('#pdf-lazy-loader-compatibility-status');
        if ($status.length === 0) return;

        var html = '<h3>Compatibility Status</h3>';
        html += '<ul>';
        html += '<li>Redis Cache: ' + (pdfLazyLoaderAdmin.redisEnabled ? '✓ Active' : '✗ Inactive') + '</li>';
        html += '<li>FlyingPress: ' + (pdfLazyLoaderAdmin.flyingPressEnabled ? '✓ Active' : '✗ Inactive') + '</li>';
        html += '</ul>';

        $status.html(html);
    }

})(jQuery);
