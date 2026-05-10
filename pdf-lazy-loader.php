<?php
/**
 * Plugin Name: PDF Lazy Loader
 * Plugin URI: https://github.com/gemuzkm/pdf-lazy-loader
 * Description: Optimizes PDF loading with lazy loading pattern for better performance and user experience. Replaces PDF iframes with a preview facade that loads the actual PDF only when user clicks. Includes URL encryption, Cloudflare Turnstile protection, and responsive design.
 * Version: 1.0.9
 * Author: Your TM
 * Author URI: https://procarmanuals.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: pdf-lazy-loader
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.7
 * Requires PHP: 7.2
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PDF_LAZY_LOADER_VERSION', '1.0.9');
define('PDF_LAZY_LOADER_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PDF_LAZY_LOADER_PLUGIN_URL', plugin_dir_url(__FILE__));

$GLOBALS['pdf_lazy_loader_has_pdfs'] = false;

add_action('admin_menu',            'pdf_lazy_loader_add_admin_menu');
add_action('admin_init',            'pdf_lazy_loader_register_settings');
add_action('admin_enqueue_scripts', 'pdf_lazy_loader_enqueue_admin_scripts');
add_action('wp_enqueue_scripts',    'pdf_lazy_loader_enqueue_frontend_scripts');
add_action('wp_head',               'pdf_lazy_loader_add_inline_script', 1);

// Dequeue all PDF Embedder assets — loaded on-demand by JS after user clicks View PDF
add_action('wp_enqueue_scripts', 'pdf_lazy_loader_dequeue_pdfemb_assets', 999);

// ob_start HTML filter — strips <link> tags for PDF Embedder assets that were
// enqueued AFTER wp_enqueue_scripts (e.g. inside shortcode render() callbacks).
add_action('template_redirect', 'pdf_lazy_loader_start_output_buffer', 1);

// Checkbox save hooks
add_filter('pre_update_option_pdf_lazy_loader_enable_download',  'pdf_lazy_loader_update_checkbox', 10, 2);
add_filter('pre_update_option_pdf_lazy_loader_enable_turnstile', 'pdf_lazy_loader_update_checkbox', 10, 2);
add_filter('pre_update_option_pdf_lazy_loader_debug_mode',       'pdf_lazy_loader_update_checkbox', 10, 2);

add_filter('the_content',         'pdf_lazy_loader_filter_content', 999);
add_filter('widget_text',         'pdf_lazy_loader_filter_content', 999);
add_filter('widget_block_content','pdf_lazy_loader_filter_content', 999);
add_filter('rest_prepare_post',   'pdf_lazy_loader_filter_rest_content', 999, 3);

// ---------------------------------------------------------------------------
// ob_start output buffer — removes late-enqueued PDF Embedder <link> tags
// ---------------------------------------------------------------------------

function pdf_lazy_loader_start_output_buffer() {
    if (is_admin()) return;
    if (!pdf_lazy_loader_has_pdf_iframes()) return;
    ob_start('pdf_lazy_loader_filter_html_output');
}

function pdf_lazy_loader_filter_html_output($html) {
    if (empty($html)) return $html;
    $html = preg_replace(
        '#<link\b[^>]*\bhref=["\'][^"\']*(?:PDFEmbedder-premium(?:-secure)?|pdf-embedder-premium|pdf-embedder)[^"\']*["\'][^>]*/?\s*>#i',
        '', $html
    );
    $html = preg_replace(
        '#<script\b[^>]*\bsrc=["\'][^"\']*(?:PDFEmbedder-premium(?:-secure)?|pdf-embedder-premium|pdf-embedder)[^"\']*["\'][^>]*>\s*</script>#i',
        '', $html
    );
    return $html;
}

// ---------------------------------------------------------------------------
// Dequeue PDF Embedder assets & collect their URLs for on-demand loading
// ---------------------------------------------------------------------------

function pdf_lazy_loader_get_pdfemb_handles() {
    return array(
        'styles' => array(
            'pdf-fullscreen', 'pdfemb-fullscreen', 'pdfemb-frontend',
            'pdfemb-pdf-fullscreen', 'pdf-embedder', 'pdfemb',
        ),
        'scripts' => array(
            'pdfemb-pdf-viewer', 'pdfemb-pdf-worker', 'pdfemb-all-premium',
            'pdfemb-all-premium-min', 'pdfemb-pdf-viewer-min', 'pdfemb-pdf-worker-min',
            'all-pdfemb-premium', 'pdfemb-main', 'pdfemb-pdf', 'pdfemb-pdf-worker-free',
            'pdf-embedder', 'pdfemb',
        ),
    );
}

function pdf_lazy_loader_dequeue_pdfemb_assets() {
    if (is_admin()) return;
    if (!pdf_lazy_loader_has_pdf_iframes()) return;

    global $wp_styles, $wp_scripts;
    $handles  = pdf_lazy_loader_get_pdfemb_handles();
    $css_urls = array();
    $js_urls  = array();

    foreach ($handles['styles'] as $handle) {
        if (isset($wp_styles->registered[$handle])) {
            $src = $wp_styles->registered[$handle]->src;
            if ($src) {
                if (strpos($src, '//') !== 0 && strpos($src, 'http') !== 0) $src = site_url($src);
                $css_urls[] = $src;
            }
            wp_dequeue_style($handle);
            wp_deregister_style($handle);
        }
    }

    if (!empty($wp_styles->queue)) {
        foreach ($wp_styles->queue as $queued_handle) {
            if ((strpos($queued_handle, 'pdfemb') !== false ||
                 strpos($queued_handle, 'pdf-embedder') !== false ||
                 strpos($queued_handle, 'pdf-fullscreen') !== false) &&
                isset($wp_styles->registered[$queued_handle])) {
                $src = $wp_styles->registered[$queued_handle]->src;
                if ($src && !in_array($src, $css_urls, true)) {
                    if (strpos($src, '//') !== 0 && strpos($src, 'http') !== 0) $src = site_url($src);
                    $css_urls[] = $src;
                }
                wp_dequeue_style($queued_handle);
                wp_deregister_style($queued_handle);
            }
        }
    }

    foreach ($handles['scripts'] as $handle) {
        if (isset($wp_scripts->registered[$handle])) {
            $src = $wp_scripts->registered[$handle]->src;
            if ($src) {
                if (strpos($src, '//') !== 0 && strpos($src, 'http') !== 0) $src = site_url($src);
                $js_urls[] = $src;
            }
            wp_dequeue_script($handle);
            wp_deregister_script($handle);
        }
    }

    if (!empty($wp_scripts->queue)) {
        foreach ($wp_scripts->queue as $queued_handle) {
            if ((strpos($queued_handle, 'pdfemb') !== false ||
                 strpos($queued_handle, 'pdf-embedder') !== false) &&
                isset($wp_scripts->registered[$queued_handle])) {
                $src = $wp_scripts->registered[$queued_handle]->src;
                if ($src && !in_array($src, $js_urls, true)) {
                    if (strpos($src, '//') !== 0 && strpos($src, 'http') !== 0) $src = site_url($src);
                    $js_urls[] = $src;
                }
                wp_dequeue_script($queued_handle);
                wp_deregister_script($queued_handle);
            }
        }
    }

    $GLOBALS['pdf_lazy_loader_pdfemb_assets'] = array(
        'css' => array_values(array_unique($css_urls)),
        'js'  => array_values(array_unique($js_urls)),
    );
}

// ---------------------------------------------------------------------------
// Admin menu
// ---------------------------------------------------------------------------

function pdf_lazy_loader_add_admin_menu() {
    add_options_page(
        'PDF Lazy Loader Settings',
        'PDF Lazy Loader',
        'manage_options',
        'pdf-lazy-loader-settings',
        'pdf_lazy_loader_settings_page'
    );
}

// ---------------------------------------------------------------------------
// Settings registration
// ---------------------------------------------------------------------------

function pdf_lazy_loader_register_settings() {
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_button_color', array(
        'type' => 'string', 'sanitize_callback' => 'sanitize_hex_color', 'default' => '#FF6B6B'
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_button_color_hover', array(
        'type' => 'string', 'sanitize_callback' => 'sanitize_hex_color', 'default' => '#E63946'
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_loading_time', array(
        'type' => 'integer', 'sanitize_callback' => 'absint', 'default' => 1500
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_enable_download', array(
        'type' => 'boolean', 'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox', 'default' => false
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_desktop', array(
        'type' => 'integer', 'sanitize_callback' => 'absint', 'default' => 600
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_tablet', array(
        'type' => 'integer', 'sanitize_callback' => 'absint', 'default' => 500
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_mobile', array(
        'type' => 'integer', 'sanitize_callback' => 'absint', 'default' => 400
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_enable_turnstile', array(
        'type' => 'boolean', 'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox', 'default' => false
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_turnstile_site_key', array(
        'type' => 'string', 'sanitize_callback' => 'sanitize_text_field', 'default' => ''
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_turnstile_secret_key', array(
        'type' => 'string', 'sanitize_callback' => 'sanitize_text_field', 'default' => ''
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_debug_mode', array(
        'type' => 'boolean', 'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox', 'default' => false
    ));
}

function pdf_lazy_loader_sanitize_checkbox($value) {
    return $value === '1' || $value === 1 || $value === true;
}

function pdf_lazy_loader_update_checkbox($value, $old_value) {
    $option_page = isset($_POST['option_page']) ? sanitize_text_field($_POST['option_page']) : '';
    $wpnonce     = isset($_POST['_wpnonce'])    ? sanitize_text_field($_POST['_wpnonce'])    : '';

    if ($option_page === 'pdf_lazy_loader_settings' && !empty($wpnonce)) {
        $option_name = str_replace('pre_update_option_', '', current_filter());
        $post_value  = isset($_POST[$option_name]) ? sanitize_text_field($_POST[$option_name]) : '0';
        return $post_value === '1' || $post_value === 1 || $post_value === true;
    }
    return $value === '1' || $value === 1 || $value === true || $value === 'true';
}

// ---------------------------------------------------------------------------
// Settings reader
// ---------------------------------------------------------------------------

function pdf_lazy_loader_get_settings() {
    $to_bool = function($v) { return $v === '1' || $v === 1 || $v === true; };
    return array(
        'buttonColor'         => get_option('pdf_lazy_loader_button_color', '#FF6B6B'),
        'buttonColorHover'    => get_option('pdf_lazy_loader_button_color_hover', '#E63946'),
        'loadingTime'         => intval(get_option('pdf_lazy_loader_loading_time', 1500)),
        'enableDownload'      => $to_bool(get_option('pdf_lazy_loader_enable_download', false)),
        'facadeHeightDesktop' => intval(get_option('pdf_lazy_loader_facade_height_desktop', 600)),
        'facadeHeightTablet'  => intval(get_option('pdf_lazy_loader_facade_height_tablet',  500)),
        'facadeHeightMobile'  => intval(get_option('pdf_lazy_loader_facade_height_mobile',  400)),
        'enableTurnstile'     => $to_bool(get_option('pdf_lazy_loader_enable_turnstile', false)),
        'turnstileSiteKey'    => sanitize_text_field(get_option('pdf_lazy_loader_turnstile_site_key', '')),
        'debugMode'           => $to_bool(get_option('pdf_lazy_loader_debug_mode', false)),
    );
}

// ---------------------------------------------------------------------------
// Admin enqueue
// ---------------------------------------------------------------------------

function pdf_lazy_loader_enqueue_admin_scripts($hook) {
    if ($hook !== 'settings_page_pdf-lazy-loader-settings') return;
    $settings = pdf_lazy_loader_get_settings();
    wp_enqueue_style('pdf-lazy-loader-admin',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/css/admin.css', array(), PDF_LAZY_LOADER_VERSION);
    wp_enqueue_script('pdf-lazy-loader-admin',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/admin.js', array('jquery'), PDF_LAZY_LOADER_VERSION, true);
    wp_localize_script('pdf-lazy-loader-admin', 'pdfLazyLoaderAdmin', $settings);
}

// ---------------------------------------------------------------------------
// Encryption helper
// ---------------------------------------------------------------------------

function pdf_lazy_loader_encrypt_url($url) {
    if (empty($url)) return '';
    $key     = 'pdf-lazy-loader-secure-key-2024';
    $key_len = strlen($key);
    $out     = '';
    for ($i = 0, $len = strlen($url); $i < $len; $i++) {
        $out .= chr(ord($url[$i]) ^ ord($key[$i % $key_len]));
    }
    return base64_encode($out);
}

// ---------------------------------------------------------------------------
// PDF URL detection
// ---------------------------------------------------------------------------

function pdf_lazy_loader_is_pdf_url($url) {
    if (empty($url)) return false;
    $indicators = array('.pdf','application/pdf','pdf-embedder','pdfembed','pdfemb-data','pdfjs','viewer.html');
    $lower = strtolower($url);
    foreach ($indicators as $ind) {
        if (strpos($lower, $ind) !== false) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Content filter (static iframes)
// ---------------------------------------------------------------------------

function pdf_lazy_loader_filter_content($content) {
    if (is_admin()) return $content;
    if (empty($content) || strpos($content, '<iframe') === false) return $content;
    return preg_replace_callback('/<iframe([^>]*?)>/is', function($matches) {
        $attrs = $matches[1];
        if (preg_match('/\ssrc\s*=\s*["\'](.*?)["\']]/i', $attrs, $m) ||
            preg_match('/\ssrc\s*=\s*["\']([^"\']*?)["\']/i', $attrs, $m)) {
            if (pdf_lazy_loader_is_pdf_url($m[1])) {
                $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
                $enc       = pdf_lazy_loader_encrypt_url($m[1]);
                $new_attrs = preg_replace('/\ssrc\s*=\s*["\'][^"\']*?["\']/i', '', $attrs);
                $new_attrs = trim($new_attrs);
                if (!empty($new_attrs)) $new_attrs = ' ' . $new_attrs;
                $new_attrs .= ' data-pdf-lazy-original-src-enc="' . esc_attr($enc) . '"';
                $new_attrs .= ' data-pdf-lazy-intercepted="1"';
                return '<iframe' . $new_attrs . '>';
            }
        }
        return $matches[0];
    }, $content);
}

function pdf_lazy_loader_filter_rest_content($response, $post, $request) {
    if (is_wp_error($response)) return $response;
    if (isset($response->data['content']['rendered'])) {
        $response->data['content']['rendered'] =
            pdf_lazy_loader_filter_content($response->data['content']['rendered']);
    }
    return $response;
}

// ---------------------------------------------------------------------------
// Page-level PDF detection
// ---------------------------------------------------------------------------

function pdf_lazy_loader_has_pdf_iframes() {
    if (is_admin()) return false;
    if (!empty($GLOBALS['pdf_lazy_loader_has_pdfs'])) return true;

    if (is_singular() || is_home() || is_archive()) {
        global $post;
        if ($post && !empty($post->post_content)) {
            $c = $post->post_content;
            if (strpos($c, '[pdf-embedder') !== false ||
                strpos($c, '[pdfemb')       !== false ||
                strpos($c, 'pdf-embedder')  !== false) {
                $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
                return true;
            }
            if (strpos($c, 'data-pdf-lazy-intercepted')      !== false ||
                strpos($c, 'data-pdf-lazy-original-src-enc') !== false) {
                $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
                return true;
            }
            if (strpos($c, '<iframe') !== false &&
                preg_match_all('/<iframe[^>]*(?:src|data-src)\s*=\s*["\']([^"\']*?)["\']/is', $c, $m)) {
                foreach ($m[1] as $src) {
                    if (pdf_lazy_loader_is_pdf_url($src)) {
                        $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Inline head script (early iframe interceptor)
// ---------------------------------------------------------------------------

function pdf_lazy_loader_add_inline_script() {
    if (is_admin()) return;
    if (!pdf_lazy_loader_has_pdf_iframes()) return;
    ?>
    <script type="text/javascript">
    (function(){
        'use strict';
        var KEY='pdf-lazy-loader-secure-key-2024';
        function xorB64(s){
            var o='';
            for(var i=0;i<s.length;i++) o+=String.fromCharCode(s.charCodeAt(i)^KEY.charCodeAt(i%KEY.length));
            try{return btoa(o);}catch(e){return '';}
        }
        function intercept(iframe){
            var src=iframe.getAttribute('src')||'';
            if(!src||iframe.hasAttribute('data-pdf-lazy-original-src-enc')) return false;
            var low=src.toLowerCase();
            var inds=['.pdf','application/pdf','pdf-embedder','pdfembed','pdfemb-data','pdfjs','viewer.html'];
            for(var j=0;j<inds.length;j++){
                if(low.indexOf(inds[j])!==-1){
                    var enc=xorB64(src);
                    if(!enc) return false;
                    iframe.setAttribute('data-pdf-lazy-original-src-enc',enc);
                    iframe.removeAttribute('src');
                    iframe.setAttribute('data-pdf-lazy-intercepted','1');
                    return true;
                }
            }
            return false;
        }
        function interceptAll(){
            var els=document.querySelectorAll('iframe');
            for(var i=0;i<els.length;i++) intercept(els[i]);
        }
        interceptAll();
        if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',interceptAll,{once:true});
        if(typeof MutationObserver!=='undefined'){
            var obs=new MutationObserver(function(muts){
                for(var m=0;m<muts.length;m++){
                    var nodes=muts[m].addedNodes;
                    for(var n=0;n<nodes.length;n++){
                        var node=nodes[n];
                        if(node.nodeType!==1) continue;
                        if(node.tagName==='IFRAME') intercept(node);
                        if(node.querySelectorAll){
                            var nested=node.querySelectorAll('iframe');
                            for(var k=0;k<nested.length;k++) intercept(nested[k]);
                        }
                    }
                }
            });
            obs.observe(document.body||document.documentElement,{childList:true,subtree:true});
        }
    })();
    </script>
    <?php
}

// ---------------------------------------------------------------------------
// Frontend enqueue
// ---------------------------------------------------------------------------

function pdf_lazy_loader_enqueue_frontend_scripts() {
    if (is_admin()) return;
    if (!pdf_lazy_loader_has_pdf_iframes()) return;

    $settings = pdf_lazy_loader_get_settings();

    add_action('wp_enqueue_scripts', function() use ($settings) {
        $pdfemb_assets = isset($GLOBALS['pdf_lazy_loader_pdfemb_assets'])
            ? $GLOBALS['pdf_lazy_loader_pdfemb_assets']
            : array('css' => array(), 'js' => array());

        $data = array_merge($settings, array('pdfembAssets' => $pdfemb_assets));

        wp_enqueue_style('pdf-lazy-loader',
            PDF_LAZY_LOADER_PLUGIN_URL . 'assets/css/pdf-lazy-loader.css',
            array(), PDF_LAZY_LOADER_VERSION);
        wp_enqueue_script('pdf-lazy-loader',
            PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/pdf-lazy-loader.js',
            array(), PDF_LAZY_LOADER_VERSION, true);
        wp_localize_script('pdf-lazy-loader', 'pdfLazyLoaderData', $data);
    }, 1000);
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

function pdf_lazy_loader_settings_page() {
    if (!current_user_can('manage_options')) {
        wp_die(__('You do not have sufficient permissions to access this page.'));
    }
    $settings = pdf_lazy_loader_get_settings();
    ?>
    <div class="wrap pdf-lazy-loader-settings">
        <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
        <?php settings_errors('pdf_lazy_loader_settings'); ?>

        <form method="post" action="options.php">
            <?php settings_fields('pdf_lazy_loader_settings'); ?>

            <div class="pll-section">
                <div class="pll-section__header">
                    <span class="pll-section__icon">🎨</span>
                    <h2 class="pll-section__title">Button &amp; Appearance</h2>
                </div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_button_color">Button Color</label></th>
                        <td>
                            <div class="pll-color-row">
                                <input type="color" id="pdf_lazy_loader_button_color" name="pdf_lazy_loader_button_color"
                                       value="<?php echo esc_attr($settings['buttonColor']); ?>" />
                                <code class="pll-color-value" id="pll-color-val-main"><?php echo esc_html($settings['buttonColor']); ?></code>
                            </div>
                            <span class="description">Color of the "View PDF" button</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_button_color_hover">Button Hover Color</label></th>
                        <td>
                            <div class="pll-color-row">
                                <input type="color" id="pdf_lazy_loader_button_color_hover" name="pdf_lazy_loader_button_color_hover"
                                       value="<?php echo esc_attr($settings['buttonColorHover']); ?>" />
                                <code class="pll-color-value" id="pll-color-val-hover"><?php echo esc_html($settings['buttonColorHover']); ?></code>
                            </div>
                            <span class="description">Color on mouse hover</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_loading_time">Loading Animation (ms)</label></th>
                        <td>
                            <input type="number" id="pdf_lazy_loader_loading_time" name="pdf_lazy_loader_loading_time"
                                   value="<?php echo esc_attr($settings['loadingTime']); ?>"
                                   min="500" max="5000" step="100" class="pll-input-sm" />
                            <span class="description">Spinner duration before PDF loads (500–5000 ms)</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_enable_download">Show Download Button</label></th>
                        <td>
                            <input type="hidden" name="pdf_lazy_loader_enable_download" value="0" />
                            <label class="pll-toggle">
                                <input type="checkbox" id="pdf_lazy_loader_enable_download" name="pdf_lazy_loader_enable_download"
                                       value="1" <?php checked($settings['enableDownload'], true); ?> />
                                <span class="pll-toggle__slider"></span>
                            </label>
                            <span class="description">Show a Download button alongside View PDF</span>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="pll-section">
                <div class="pll-section__header">
                    <span class="pll-section__icon">📐</span>
                    <h2 class="pll-section__title">Facade Heights</h2>
                </div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_facade_height_desktop">Desktop <span class="pll-badge">≥ 1024px</span></label></th>
                        <td>
                            <div class="pll-input-row">
                                <input type="number" id="pdf_lazy_loader_facade_height_desktop" name="pdf_lazy_loader_facade_height_desktop"
                                       value="<?php echo esc_attr($settings['facadeHeightDesktop']); ?>"
                                       min="200" max="2000" step="10" class="pll-input-sm" />
                                <span class="pll-unit">px</span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_facade_height_tablet">Tablet <span class="pll-badge">768 – 1023px</span></label></th>
                        <td>
                            <div class="pll-input-row">
                                <input type="number" id="pdf_lazy_loader_facade_height_tablet" name="pdf_lazy_loader_facade_height_tablet"
                                       value="<?php echo esc_attr($settings['facadeHeightTablet']); ?>"
                                       min="200" max="1500" step="10" class="pll-input-sm" />
                                <span class="pll-unit">px</span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_facade_height_mobile">Mobile <span class="pll-badge">&lt; 768px</span></label></th>
                        <td>
                            <div class="pll-input-row">
                                <input type="number" id="pdf_lazy_loader_facade_height_mobile" name="pdf_lazy_loader_facade_height_mobile"
                                       value="<?php echo esc_attr($settings['facadeHeightMobile']); ?>"
                                       min="200" max="1000" step="10" class="pll-input-sm" />
                                <span class="pll-unit">px</span>
                            </div>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="pll-section">
                <div class="pll-section__header">
                    <span class="pll-section__icon">🛡️</span>
                    <h2 class="pll-section__title">Cloudflare Turnstile Protection</h2>
                </div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_enable_turnstile">Enable Turnstile</label></th>
                        <td>
                            <input type="hidden" name="pdf_lazy_loader_enable_turnstile" value="0" />
                            <label class="pll-toggle">
                                <input type="checkbox" id="pdf_lazy_loader_enable_turnstile" name="pdf_lazy_loader_enable_turnstile"
                                       value="1" <?php checked($settings['enableTurnstile'], true); ?> />
                                <span class="pll-toggle__slider"></span>
                            </label>
                            <span class="description">Require Cloudflare Turnstile verification before viewing or downloading PDF</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_turnstile_site_key">Site Key</label></th>
                        <td>
                            <input type="text" id="pdf_lazy_loader_turnstile_site_key" name="pdf_lazy_loader_turnstile_site_key"
                                   value="<?php echo esc_attr($settings['turnstileSiteKey']); ?>"
                                   class="regular-text" placeholder="1x00000000000000000000AA" />
                            <span class="description">Your Cloudflare Turnstile Site Key
                                (<a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noopener">get it here</a>)
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_turnstile_secret_key">Secret Key</label></th>
                        <td>
                            <input type="password" id="pdf_lazy_loader_turnstile_secret_key" name="pdf_lazy_loader_turnstile_secret_key"
                                   value="<?php echo esc_attr(get_option('pdf_lazy_loader_turnstile_secret_key', '')); ?>"
                                   class="regular-text" placeholder="1x0000000000000000000000000000000AA" />
                            <span class="description">Your Cloudflare Turnstile Secret Key (stored securely)</span>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="pll-section">
                <div class="pll-section__header">
                    <span class="pll-section__icon">🐞</span>
                    <h2 class="pll-section__title">Debug Settings</h2>
                </div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_debug_mode">Enable Debug Mode</label></th>
                        <td>
                            <input type="hidden" name="pdf_lazy_loader_debug_mode" value="0" />
                            <label class="pll-toggle">
                                <input type="checkbox" id="pdf_lazy_loader_debug_mode" name="pdf_lazy_loader_debug_mode"
                                       value="1" <?php checked($settings['debugMode'], true); ?> />
                                <span class="pll-toggle__slider"></span>
                            </label>
                            <span class="description">Outputs detailed logs to the browser console. <strong>Disable in production.</strong></span>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="pll-footer">
                <?php submit_button('Save Changes', 'primary', 'submit', false); ?>
                <span class="pll-version">PDF Lazy Loader v<?php echo esc_html(PDF_LAZY_LOADER_VERSION); ?></span>
            </div>

        </form>

        <div class="pll-info-card">
            <div class="pll-info-card__header">
                <span class="pll-section__icon">👁️</span>
                <h2 class="pll-section__title">Live Preview</h2>
            </div>
            <p class="pll-info-card__desc">Facade appearance with current button color settings:</p>
            <div id="pdf-lazy-loader-preview"></div>
        </div>

    </div>
    <?php
}

// ---------------------------------------------------------------------------
// Activation / Uninstall
// ---------------------------------------------------------------------------

register_activation_hook(__FILE__, 'pdf_lazy_loader_activation');
function pdf_lazy_loader_activation() {
    $defaults = array(
        'pdf_lazy_loader_button_color'       => '#FF6B6B',
        'pdf_lazy_loader_button_color_hover' => '#E63946',
        'pdf_lazy_loader_loading_time'       => '1500',
    );
    foreach ($defaults as $key => $value) {
        if (get_option($key) === false) update_option($key, $value);
    }
}

register_uninstall_hook(__FILE__, 'pdf_lazy_loader_uninstall');
function pdf_lazy_loader_uninstall() {
    $options = array(
        'pdf_lazy_loader_button_color','pdf_lazy_loader_button_color_hover',
        'pdf_lazy_loader_loading_time','pdf_lazy_loader_enable_download',
        'pdf_lazy_loader_facade_height_desktop','pdf_lazy_loader_facade_height_tablet',
        'pdf_lazy_loader_facade_height_mobile','pdf_lazy_loader_enable_turnstile',
        'pdf_lazy_loader_turnstile_site_key','pdf_lazy_loader_turnstile_secret_key',
        'pdf_lazy_loader_debug_mode',
    );
    foreach ($options as $o) delete_option($o);
}
