/**
 * PDF Lazy Loader - Admin JavaScript
 */

(function($) {
    'use strict';

    var PDFLazyLoaderAdmin = {
        init: function() {
            this.bindEvents();
            this.checkSystemInfo();
        },

        bindEvents: function() {
            // Предпросмотр цвета кнопки
            $('#pdf_lazy_loader_button_color').on('change', function() {
                PDFLazyLoaderAdmin.updateColorPreview();
            });

            // Сохранение и очистка кеша
            $('form').on('submit', function() {
                PDFLazyLoaderAdmin.clearCache();
            });
        },

        updateColorPreview: function() {
            var color = $('#pdf_lazy_loader_button_color').val();
            console.log('Color changed to: ' + color);
            // Можно добавить живой предпросмотр
        },

        checkSystemInfo: function() {
            var redisEnabled = pdfLazyLoaderAdmin.redisEnabled;
            var flyingPressEnabled = pdfLazyLoaderAdmin.flyingPressEnabled;

            console.log('Redis Enabled:', redisEnabled);
            console.log('FlyingPress Enabled:', flyingPressEnabled);

            // Уведомления совместимости
            if (redisEnabled) {
                console.log('✓ Redis Object Cache detected');
            }
            if (flyingPressEnabled) {
                console.log('✓ FlyingPress detected');
            }
        },

        clearCache: function() {
            $.ajax({
                url: pdfLazyLoaderAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'pdf_lazy_loader_clear_cache',
                    nonce: pdfLazyLoaderAdmin.nonce
                },
                success: function(response) {
                    console.log('Cache cleared successfully');
                }
            });
        }
    };

    $(document).ready(function() {
        PDFLazyLoaderAdmin.init();
    });

})(jQuery);
