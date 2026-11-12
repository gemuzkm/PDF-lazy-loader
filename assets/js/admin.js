/* PDF Lazy Loader — settings page: live facade preview */
(function () {
    'use strict';

    var data = (typeof pdfLazyLoaderAdmin !== 'undefined' && pdfLazyLoaderAdmin) ? pdfLazyLoaderAdmin : {};
    var i18n = data.i18n || {};
    var text = {
        title:    i18n.title    || 'PDF Document',
        subtitle: i18n.subtitle || 'Click the button below to load the document',
        view:     i18n.view     || 'View PDF',
        download: i18n.download || 'Download',
        info:     i18n.info     || 'Document will be loaded on first access'
    };
    var enforceContrast = data.enforceContrast !== false;

    var FIELDS = [
        'pdf_lazy_loader_button_color',
        'pdf_lazy_loader_button_color_hover',
        'pdf_lazy_loader_enable_download',
        'pdf_lazy_loader_facade_height_desktop',
        'pdf_lazy_loader_facade_height_tablet',
        'pdf_lazy_loader_facade_height_mobile'
    ];

    function byId(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // WCAG AA contrast with white text — same math as pdf_lazy_loader_accessible_colors() in PHP
    function hexToRgb(hex) {
        hex = String(hex || '').replace('#', '');
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }

    function rgbToHex(rgb) {
        return '#' + rgb.map(function (v) {
            v = Math.max(0, Math.min(255, Math.round(v)));
            return (v < 16 ? '0' : '') + v.toString(16);
        }).join('').toUpperCase();
    }

    function luminance(rgb) {
        var c = rgb.map(function (v) {
            v = v / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    function contrastWithWhite(rgb) { return 1.05 / (luminance(rgb) + 0.05); }

    function darken(rgb) {
        var out = rgb.slice();
        for (var k = 0; k <= 1.0001 && contrastWithWhite(out) < 4.5; k += 0.02) {
            out = [rgb[0] * (1 - k), rgb[1] * (1 - k), rgb[2] * (1 - k)];
        }
        return out;
    }

    function accessibleColors(btn, hover) {
        var b = hexToRgb(btn) || [255, 107, 107];
        var h = hexToRgb(hover) || [230, 57, 70];
        if (!enforceContrast) return { btn: rgbToHex(b), hover: rgbToHex(h), adjusted: false };

        var b2 = darken(b), h2 = darken(h);
        // Hover must differ noticeably from the base color
        if (Math.abs(luminance(h2) - luminance(b2)) < 0.02) h2 = [b2[0] * 0.85, b2[1] * 0.85, b2[2] * 0.85];
        var btnHex = rgbToHex(b2), hoverHex = rgbToHex(h2);
        return { btn: btnHex, hover: hoverHex, adjusted: btnHex !== rgbToHex(b) || hoverHex !== rgbToHex(h) };
    }

    function fieldValue(id, fallback) {
        var el = byId(id);
        return el && el.value ? el.value : fallback;
    }

    function fieldHeight(id, fallback) {
        var n = parseInt(fieldValue(id, ''), 10);
        return Math.max(200, isNaN(n) ? fallback : n) + 'px';
    }

    // The preview is the real facade markup styled by the real facade stylesheet
    function render() {
        var box = byId('pdf-lazy-loader-preview');
        if (!box) return;

        var color    = fieldValue('pdf_lazy_loader_button_color', data.buttonColor || '#FF6B6B');
        var hover    = fieldValue('pdf_lazy_loader_button_color_hover', data.buttonColorHover || '#E63946');
        var dlField  = byId('pdf_lazy_loader_enable_download');
        var download = dlField ? dlField.checked : !!data.enableDownload;
        var colors   = accessibleColors(color, hover);

        var mainLabel = byId('pll-color-val-main'), hoverLabel = byId('pll-color-val-hover');
        if (mainLabel) mainLabel.textContent = color;
        if (hoverLabel) hoverLabel.textContent = hover;

        box.style.setProperty('--pll-btn', colors.btn);
        box.style.setProperty('--pll-btn-hover', colors.hover);
        box.style.setProperty('--pll-btn-text', '#fff');
        box.style.setProperty('--pll-h-desktop', fieldHeight('pdf_lazy_loader_facade_height_desktop', 600));
        box.style.setProperty('--pll-h-tablet', fieldHeight('pdf_lazy_loader_facade_height_tablet', 500));
        box.style.setProperty('--pll-h-mobile', fieldHeight('pdf_lazy_loader_facade_height_mobile', 400));

        var html = '<div class="pdf-facade-wrapper"><div class="pdf-facade-container"><div class="pdf-facade-content">' +
            '<div class="pdf-facade-icon" aria-hidden="true">PDF</div>' +
            '<div class="pdf-facade-title">' + esc(text.title) + '</div>' +
            '<p class="pdf-facade-subtitle">' + esc(text.subtitle) + '</p>' +
            '<div class="pdf-facade-buttons">' +
            '<button type="button" class="pdf-view-button"><span class="pdf-btn-icon" aria-hidden="true">\uD83D\uDCD6</span>' + esc(text.view) + '</button>' +
            (download ? '<button type="button" class="pdf-download-button"><span class="pdf-btn-icon" aria-hidden="true">\u2B07\uFE0F</span>' + esc(text.download) + '</button>' : '') +
            '</div><p class="pdf-facade-info">' + esc(text.info) + '</p></div></div></div>';

        if (colors.adjusted) {
            html += '<p class="description pll-preview-note">Colors are darkened for WCAG AA contrast with white text: button ' +
                esc(colors.btn) + ', hover ' + esc(colors.hover) + '.</p>';
        }
        box.innerHTML = html;
    }

    // Only the "Settings saved" notice goes away by itself. Error notices and
    // notices of other plugins are never hidden or removed.
    function dismissSavedNotice() {
        var notice = byId('setting-error-settings_updated');
        if (!notice) return;
        setTimeout(function () {
            notice.style.transition = 'opacity .3s';
            notice.style.opacity = '0';
            setTimeout(function () { if (notice.parentNode) notice.parentNode.removeChild(notice); }, 300);
        }, 5000);
    }

    function init() {
        if (byId('pdf-lazy-loader-preview')) {
            render();
            FIELDS.forEach(function (id) {
                var el = byId(id);
                if (!el) return;
                el.addEventListener('input', render);
                el.addEventListener('change', render);
            });
        }
        dismissSavedNotice();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
