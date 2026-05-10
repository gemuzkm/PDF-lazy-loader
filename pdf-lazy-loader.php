<?php
/**
 * Plugin Name: PDF Lazy Loader
 * Plugin URI: https://github.com/gemuzkm/pdf-lazy-loader
 * Description: Optimizes PDF loading with lazy loading pattern for better performance and user experience. Replaces PDF iframes with a preview facade that loads the actual PDF only when user clicks. Includes URL encryption, Cloudflare Turnstile protection, and responsive design.
 * Version: 1.0.7
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

define('PDF_LAZY_LOADER_VERSION', '1.0.7');
define('PDF_LAZY_LOADER_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PDF_LAZY_LOADER_PLUGIN_URL', plugin_dir_url(__FILE__));

// Global flag to track if PDF iframes are found on current page
$GLOBALS['pdf_lazy_loader_has_pdfs'] = false;

add_action('admin_menu', 'pdf_lazy_loader_add_admin_menu');
add_action('admin_init', 'pdf_lazy_loader_register_settings');
add_action('admin_enqueue_scripts', 'pdf_lazy_loader_enqueue_admin_scripts');
add_action('wp_enqueue_scripts', 'pdf_lazy_loader_enqueue_frontend_scripts');
add_action('wp_head', 'pdf_lazy_loader_add_inline_script', 1);

// Checkbox save hooks for all boolean options
add_filter('pre_update_option_pdf_lazy_loader_enable_download', 'pdf_lazy_loader_update_checkbox', 10, 2);
add_filter('pre_update_option_pdf_lazy_loader_enable_turnstile', 'pdf_lazy_loader_update_checkbox', 10, 2);
add_filter('pre_update_option_pdf_lazy_loader_debug_mode', 'pdf_lazy_loader_update_checkbox', 10, 2);

add_filter('the_content', 'pdf_lazy_loader_filter_content', 999);
add_filter('widget_text', 'pdf_lazy_loader_filter_content', 999);
add_filter('widget_block_content', 'pdf_lazy_loader_filter_content', 999);
add_filter('rest_prepare_post', 'pdf_lazy_loader_filter_rest_content', 999, 3);

/**
 * Add admin menu page for plugin settings
 */
function pdf_lazy_loader_add_admin_menu() {
    add_options_page(
        'PDF Lazy Loader Settings',
        'PDF Lazy Loader',
        'manage_options',
        'pdf-lazy-loader-settings',
        'pdf_lazy_loader_settings_page'
    );
}

/**
 * Register all plugin settings with WordPress Settings API
 */
function pdf_lazy_loader_register_settings() {
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_button_color', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_hex_color',
        'default' => '#FF6B6B'
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_button_color_hover', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_hex_color',
        'default' => '#E63946'
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_loading_time', array(
        'type' => 'integer',
        'sanitize_callback' => 'absint',
        'default' => 1500
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_enable_download', array(
        'type' => 'boolean',
        'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox',
        'default' => false
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_desktop', array(
        'type' => 'integer',
        'sanitize_callback' => 'absint',
        'default' => 600
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_tablet', array(
        'type' => 'integer',
        'sanitize_callback' => 'absint',
        'default' => 500
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_mobile', array(
        'type' => 'integer',
        'sanitize_callback' => 'absint',
        'default' => 400
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_enable_turnstile', array(
        'type' => 'boolean',
        'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox',
        'default' => false
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_turnstile_site_key', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => ''
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_turnstile_secret_key', array(
        'type' => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default' => ''
    ));
    register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_debug_mode', array(
        'type' => 'boolean',
        'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox',
        'default' => false
    ));
}

/**
 * Sanitize checkbox value
 *
 * @param mixed $value
 * @return bool
 */
function pdf_lazy_loader_sanitize_checkbox($value) {
    return $value === '1' || $value === 1 || $value === true;
}

/**
 * Update checkbox option — handle unchecked state.
 * Applied to all three boolean options via pre_update_option_* filters.
 *
 * @param mixed $value
 * @param mixed $old_value
 * @return bool
 */
function pdf_lazy_loader_update_checkbox($value, $old_value) {
    $option_page = isset($_POST['option_page']) ? sanitize_text_field($_POST['option_page']) : '';
    $wpnonce     = isset($_POST['_wpnonce'])    ? sanitize_text_field($_POST['_wpnonce'])    : '';

    if ($option_page === 'pdf_lazy_loader_settings' && !empty($wpnonce)) {
        // Determine which option is being saved from the current filter tag
        $current_filter = current_filter();
        $option_name    = str_replace('pre_update_option_', '', $current_filter);
        $post_value     = isset($_POST[$option_name]) ? sanitize_text_field($_POST[$option_name]) : '0';
        return $post_value === '1' || $post_value === 1 || $post_value === true;
    }

    if ($value === '1' || $value === 1 || $value === true || $value === 'true') {
        return true;
    }
    return false;
}

/**
 * Get all plugin settings with proper type conversion
 *
 * @return array
 */
function pdf_lazy_loader_get_settings() {
    $raw_download  = get_option('pdf_lazy_loader_enable_download', false);
    $raw_turnstile = get_option('pdf_lazy_loader_enable_turnstile', false);
    $raw_debug     = get_option('pdf_lazy_loader_debug_mode', false);

    $to_bool = function($v) {
        return $v === '1' || $v === 1 || $v === true;
    };

    return array(
        'buttonColor'          => get_option('pdf_lazy_loader_button_color', '#FF6B6B'),
        'buttonColorHover'     => get_option('pdf_lazy_loader_button_color_hover', '#E63946'),
        'loadingTime'          => intval(get_option('pdf_lazy_loader_loading_time', 1500)),
        'enableDownload'       => $to_bool($raw_download),
        'facadeHeightDesktop'  => intval(get_option('pdf_lazy_loader_facade_height_desktop', 600)),
        'facadeHeightTablet'   => intval(get_option('pdf_lazy_loader_facade_height_tablet', 500)),
        'facadeHeightMobile'   => intval(get_option('pdf_lazy_loader_facade_height_mobile', 400)),
        'enableTurnstile'      => $to_bool($raw_turnstile),
        'turnstileSiteKey'     => sanitize_text_field(get_option('pdf_lazy_loader_turnstile_site_key', '')),
        'debugMode'            => $to_bool($raw_debug),
    );
}

/**
 * Enqueue admin scripts and styles — only on the plugin settings page
 *
 * @param string $hook
 */
function pdf_lazy_loader_enqueue_admin_scripts($hook) {
    if ($hook !== 'settings_page_pdf-lazy-loader-settings') {
        return;
    }
    $settings = pdf_lazy_loader_get_settings();
    wp_enqueue_style(
        'pdf-lazy-loader-admin',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/css/admin.css',
        array(),
        PDF_LAZY_LOADER_VERSION
    );
    wp_enqueue_script(
        'pdf-lazy-loader-admin',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/admin.js',
        array('jquery'),
        PDF_LAZY_LOADER_VERSION,
        true
    );
    wp_localize_script('pdf-lazy-loader-admin', 'pdfLazyLoaderAdmin', $settings);
}

/**
 * XOR + Base64 URL encryption.
 * Must match the algorithm used in PDFLazyLoader.encryptURL() in pdf-lazy-loader.js.
 *
 * @param string $url
 * @return string
 */
function pdf_lazy_loader_encrypt_url($url) {
    if (empty($url)) {
        return '';
    }
    $key       = 'pdf-lazy-loader-secure-key-2024';
    $key_len   = strlen($key);
    $encrypted = '';
    for ($i = 0, $len = strlen($url); $i < $len; $i++) {
        $encrypted .= chr(ord($url[$i]) ^ ord($key[$i % $key_len]));
    }
    return base64_encode($encrypted);
}

/**
 * Check if a URL is PDF-related.
 *
 * @param string $url
 * @return bool
 */
function pdf_lazy_loader_is_pdf_url($url) {
    if (empty($url)) {
        return false;
    }
    $indicators = array(
        '.pdf',
        'application/pdf',
        'pdf-embedder',
        'pdfembed',
        'pdfemb-data',
        'pdfjs',
        'viewer.html',
    );
    $lower = strtolower($url);
    foreach ($indicators as $ind) {
        if (strpos($lower, $ind) !== false) {
            return true;
        }
    }
    return false;
}

/**
 * Filter content: encrypt PDF iframe src attributes.
 * Note: PDF Embedder renders its iframes via JavaScript on the client side,
 * so this filter handles only static iframes already present in the HTML.
 *
 * @param string $content
 * @return string
 */
function pdf_lazy_loader_filter_content($content) {
    if (is_admin()) {
        return $content;
    }
    if (empty($content) || strpos($content, '<iframe') === false) {
        return $content;
    }
    $content = preg_replace_callback('/<iframe([^>]*?)>/is', function($matches) {
        $attributes = $matches[1];
        if (preg_match('/\ssrc\s*=\s*["\']([^"\']*?)["\']/i', $attributes, $src_match)) {
            $src = $src_match[1];
            if (pdf_lazy_loader_is_pdf_url($src)) {
                $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
                $encrypted  = pdf_lazy_loader_encrypt_url($src);
                $new_attrs  = preg_replace('/\ssrc\s*=\s*["\'][^"\']*?["\']/i', '', $attributes);
                $new_attrs  = trim($new_attrs);
                if (!empty($new_attrs)) {
                    $new_attrs = ' ' . $new_attrs;
                }
                $new_attrs .= ' data-pdf-lazy-original-src-enc="' . esc_attr($encrypted) . '"';
                $new_attrs .= ' data-pdf-lazy-intercepted="1"';
                return '<iframe' . $new_attrs . '>';
            }
        }
        return $matches[0];
    }, $content);
    return $content;
}

/**
 * Filter REST API content.
 *
 * @param WP_REST_Response $response
 * @param WP_Post          $post
 * @param WP_REST_Request  $request
 * @return WP_REST_Response
 */
function pdf_lazy_loader_filter_rest_content($response, $post, $request) {
    if (is_wp_error($response)) {
        return $response;
    }
    if (isset($response->data['content']['rendered'])) {
        $response->data['content']['rendered'] = pdf_lazy_loader_filter_content(
            $response->data['content']['rendered']
        );
    }
    return $response;
}

/**
 * Check whether the current page contains PDF Embedder content.
 *
 * PDF Embedder (and PDF Embedder Premium) renders iframes dynamically via
 * JavaScript — there are no <iframe> tags in the stored post_content.
 * We therefore look for the plugin's shortcodes instead of iframes.
 *
 * Additionally checks for plain <iframe> with PDF src for other use-cases.
 *
 * @return bool
 */
function pdf_lazy_loader_has_pdf_iframes() {
    if (is_admin()) {
        return false;
    }

    // Already confirmed by content filter
    if (!empty($GLOBALS['pdf_lazy_loader_has_pdfs'])) {
        return true;
    }

    if (is_singular() || is_home() || is_archive()) {
        global $post;
        if ($post && !empty($post->post_content)) {
            $content = $post->post_content;

            // PDF Embedder shortcodes (free and premium)
            if (
                strpos($content, '[pdf-embedder')   !== false ||
                strpos($content, '[pdfemb')         !== false ||
                strpos($content, 'pdf-embedder')    !== false
            ) {
                $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
                return true;
            }

            // Already-processed iframes (other plugins / hand-coded)
            if (
                strpos($content, 'data-pdf-lazy-intercepted')     !== false ||
                strpos($content, 'data-pdf-lazy-original-src-enc') !== false
            ) {
                $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
                return true;
            }

            // Plain iframes with PDF src
            if (strpos($content, '<iframe') !== false) {
                if (preg_match_all('/<iframe[^>]*(?:src|data-src)\s*=\s*["\']([^"\']*?)["\']/is', $content, $m)) {
                    foreach ($m[1] as $src) {
                        if (pdf_lazy_loader_is_pdf_url($src)) {
                            $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
                            return true;
                        }
                    }
                }
            }
        }
    }

    return false;
}

/**
 * Output early inline JS interceptor in <head> (priority 1).
 *
 * IMPORTANT: uses the same XOR + Base64 algorithm as PDFLazyLoader.encryptURL()
 * in pdf-lazy-loader.js so that data-pdf-lazy-original-src-enc values produced
 * here can be correctly decrypted by the main script.
 */
function pdf_lazy_loader_add_inline_script() {
    if (is_admin()) {
        return;
    }
    if (!pdf_lazy_loader_has_pdf_iframes()) {
        return;
    }
    ?>
    <script type="text/javascript">
    (function() {
        'use strict';
        // XOR + Base64 — must match PDFLazyLoader.encryptURL() in pdf-lazy-loader.js
        var ENCRYPTION_KEY = 'pdf-lazy-loader-secure-key-2024';
        function xorBase64Encode(str) {
            var out = '';
            for (var i = 0; i < str.length; i++) {
                out += String.fromCharCode(
                    str.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
                );
            }
            try { return btoa(out); } catch(e) { return ''; }
        }
        function interceptPDFIframe(iframe) {
            var src = iframe.getAttribute('src') || '';
            if (!src) return false;
            var lower = src.toLowerCase();
            var indicators = ['.pdf','application/pdf','pdf-embedder','pdfembed','pdfemb-data','pdfjs','viewer.html'];
            var isPdf = false;
            for (var j = 0; j < indicators.length; j++) {
                if (lower.indexOf(indicators[j]) !== -1) { isPdf = true; break; }
            }
            if (!isPdf) return false;
            if (iframe.hasAttribute('data-pdf-lazy-original-src-enc')) return false;
            var enc = xorBase64Encode(src);
            if (!enc) return false;
            iframe.setAttribute('data-pdf-lazy-original-src-enc', enc);
            iframe.removeAttribute('src');
            iframe.setAttribute('data-pdf-lazy-intercepted', '1');
            return true;
        }
        function interceptAll() {
            var iframes = document.querySelectorAll('iframe');
            var count = 0;
            for (var i = 0; i < iframes.length; i++) {
                if (interceptPDFIframe(iframes[i])) count++;
            }
            return count;
        }
        interceptAll();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', interceptAll, { once: true });
        }
        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function(mutations) {
                for (var m = 0; m < mutations.length; m++) {
                    var nodes = mutations[m].addedNodes;
                    for (var n = 0; n < nodes.length; n++) {
                        var node = nodes[n];
                        if (node.nodeType !== 1) continue;
                        if (node.tagName === 'IFRAME') interceptPDFIframe(node);
                        if (node.querySelectorAll) {
                            var nested = node.querySelectorAll('iframe');
                            for (var k = 0; k < nested.length; k++) interceptPDFIframe(nested[k]);
                        }
                    }
                }
            });
            var target = document.body || document.documentElement || document;
            observer.observe(target, { childList: true, subtree: true });
        }
    })();
    </script>
    <?php
}

/**
 * Enqueue frontend scripts and styles.
 * Loads only when PDF Embedder shortcodes or PDF iframes are detected.
 */
function pdf_lazy_loader_enqueue_frontend_scripts() {
    if (is_admin()) {
        return;
    }
    if (!pdf_lazy_loader_has_pdf_iframes()) {
        return;
    }
    $settings = pdf_lazy_loader_get_settings();
    wp_enqueue_style(
        'pdf-lazy-loader',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/css/pdf-lazy-loader.css',
        array(),
        PDF_LAZY_LOADER_VERSION
    );
    wp_enqueue_script(
        'pdf-lazy-loader',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/pdf-lazy-loader.js',
        array(),
        PDF_LAZY_LOADER_VERSION,
        true
    );
    wp_localize_script('pdf-lazy-loader', 'pdfLazyLoaderData', $settings);
}

/**
 * Render the plugin settings page
 */
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
            <table class="form-table">

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_button_color">Button Color</label></th>
                    <td>
                        <input type="color" id="pdf_lazy_loader_button_color" name="pdf_lazy_loader_button_color"
                               value="<?php echo esc_attr($settings['buttonColor']); ?>" />
                        <span class="description">Color of the View PDF button</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_button_color_hover">Button Hover Color</label></th>
                    <td>
                        <input type="color" id="pdf_lazy_loader_button_color_hover" name="pdf_lazy_loader_button_color_hover"
                               value="<?php echo esc_attr($settings['buttonColorHover']); ?>" />
                        <span class="description">Color on hover</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_loading_time">Loading Animation Duration (ms)</label></th>
                    <td>
                        <input type="number" id="pdf_lazy_loader_loading_time" name="pdf_lazy_loader_loading_time"
                               value="<?php echo esc_attr($settings['loadingTime']); ?>"
                               min="500" max="5000" step="100" />
                        <span class="description">Duration of loading animation (500–5000 ms)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_enable_download">Show Download Button</label></th>
                    <td>
                        <input type="hidden" name="pdf_lazy_loader_enable_download" value="0" />
                        <input type="checkbox" id="pdf_lazy_loader_enable_download" name="pdf_lazy_loader_enable_download"
                               value="1" <?php checked($settings['enableDownload'], true); ?> />
                        <span class="description">Allow users to download PDF files</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_facade_height_desktop">Facade Height – Desktop (px)</label></th>
                    <td>
                        <input type="number" id="pdf_lazy_loader_facade_height_desktop" name="pdf_lazy_loader_facade_height_desktop"
                               value="<?php echo esc_attr($settings['facadeHeightDesktop']); ?>"
                               min="200" max="2000" step="10" />
                        <span class="description">Height of the facade on desktop devices (&ge;1024px)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_facade_height_tablet">Facade Height – Tablet (px)</label></th>
                    <td>
                        <input type="number" id="pdf_lazy_loader_facade_height_tablet" name="pdf_lazy_loader_facade_height_tablet"
                               value="<?php echo esc_attr($settings['facadeHeightTablet']); ?>"
                               min="200" max="1500" step="10" />
                        <span class="description">Height of the facade on tablet devices (768px–1023px)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_facade_height_mobile">Facade Height – Mobile (px)</label></th>
                    <td>
                        <input type="number" id="pdf_lazy_loader_facade_height_mobile" name="pdf_lazy_loader_facade_height_mobile"
                               value="<?php echo esc_attr($settings['facadeHeightMobile']); ?>"
                               min="200" max="1000" step="10" />
                        <span class="description">Height of the facade on mobile devices (&lt;768px)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row" colspan="2">
                        <h2 style="margin: 20px 0 10px 0;">Cloudflare Turnstile Protection</h2>
                    </th>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_enable_turnstile">Enable Turnstile</label></th>
                    <td>
                        <input type="hidden" name="pdf_lazy_loader_enable_turnstile" value="0" />
                        <input type="checkbox" id="pdf_lazy_loader_enable_turnstile" name="pdf_lazy_loader_enable_turnstile"
                               value="1" <?php checked($settings['enableTurnstile'], true); ?> />
                        <span class="description">Enable Cloudflare Turnstile verification before viewing/downloading PDF</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_turnstile_site_key">Turnstile Site Key</label></th>
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
                    <th scope="row"><label for="pdf_lazy_loader_turnstile_secret_key">Turnstile Secret Key</label></th>
                    <td>
                        <input type="password" id="pdf_lazy_loader_turnstile_secret_key" name="pdf_lazy_loader_turnstile_secret_key"
                               value="<?php echo esc_attr(get_option('pdf_lazy_loader_turnstile_secret_key', '')); ?>"
                               class="regular-text" placeholder="1x0000000000000000000000000000000AA" />
                        <span class="description">Your Cloudflare Turnstile Secret Key (stored securely, used for server-side verification)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row" colspan="2">
                        <h2 style="margin: 20px 0 10px 0;">Debug Settings</h2>
                    </th>
                </tr>

                <tr>
                    <th scope="row"><label for="pdf_lazy_loader_debug_mode">Enable Debug Mode</label></th>
                    <td>
                        <input type="hidden" name="pdf_lazy_loader_debug_mode" value="0" />
                        <input type="checkbox" id="pdf_lazy_loader_debug_mode" name="pdf_lazy_loader_debug_mode"
                               value="1" <?php checked($settings['debugMode'], true); ?> />
                        <span class="description">Enable detailed console logging for debugging. Disable in production.</span>
                    </td>
                </tr>

            </table>
            <?php submit_button('Save Changes', 'primary', 'submit'); ?>
        </form>

        <div class="pdf-lazy-loader-info">
            <h2>Preview</h2>
            <p>This is how your PDF will look with current settings:</p>
            <div id="pdf-lazy-loader-preview"></div>
        </div>

        <div class="pdf-lazy-loader-info">
            <h2>About PDF Lazy Loader</h2>
            <p>Optimizes PDF loading with lazy loading pattern for better performance and user experience.</p>
            <p><strong>Version:</strong> <?php echo esc_html(PDF_LAZY_LOADER_VERSION); ?></p>
        </div>
    </div>
    <?php
}

/**
 * Add custom admin styles — only on the plugin settings page
 */
add_action('admin_head', 'pdf_lazy_loader_admin_styles');
function pdf_lazy_loader_admin_styles() {
    $screen = get_current_screen();
    if (!$screen || $screen->id !== 'settings_page_pdf-lazy-loader-settings') {
        return;
    }
    ?>
    <style>
        .pdf-lazy-loader-settings { background:#fff; padding:20px; border-radius:8px; }
        .pdf-lazy-loader-settings h1 { margin-bottom:30px; color:#333; }
        .pdf-lazy-loader-settings .form-table { margin-bottom:30px; }
        .pdf-lazy-loader-settings .form-table tr { border-bottom:1px solid #eee; }
        .pdf-lazy-loader-settings .form-table th { width:200px; text-align:left; padding:20px 0; background:#f9f9f9; }
        .pdf-lazy-loader-settings .form-table td { padding:20px 0; }
        .pdf-lazy-loader-settings input[type="color"] { width:60px; height:40px; border:1px solid #ddd; border-radius:4px; cursor:pointer; }
        .pdf-lazy-loader-settings input[type="number"] { width:120px; padding:8px 12px; border:1px solid #ddd; border-radius:4px; }
        .pdf-lazy-loader-settings input[type="checkbox"] { width:20px; height:20px; cursor:pointer; }
        .pdf-lazy-loader-settings .description { display:block; color:#666; font-size:12px; margin-top:6px; }
        .pdf-lazy-loader-info { background:#f9f9f9; padding:20px; border-radius:8px; margin-top:30px; border:1px solid #eee; }
        .pdf-lazy-loader-info h2 { color:#333; margin-top:0; margin-bottom:15px; }
        .pdf-lazy-loader-info p { color:#666; margin:10px 0; }
        #pdf-lazy-loader-preview { margin:20px 0; }
        @media (max-width:768px) {
            .pdf-lazy-loader-settings .form-table th,
            .pdf-lazy-loader-settings .form-table td { display:block; width:100%; }
            .pdf-lazy-loader-settings .form-table tr { display:block; margin-bottom:20px; padding-bottom:20px; }
        }
    </style>
    <?php
}

/**
 * Plugin activation: set default option values
 */
register_activation_hook(__FILE__, 'pdf_lazy_loader_activation');
function pdf_lazy_loader_activation() {
    $defaults = array(
        'pdf_lazy_loader_button_color'       => '#FF6B6B',
        'pdf_lazy_loader_button_color_hover' => '#E63946',
        'pdf_lazy_loader_loading_time'       => '1500',
    );
    foreach ($defaults as $key => $value) {
        if (get_option($key) === false) {
            update_option($key, $value);
        }
    }
}

/**
 * Plugin uninstall: clean up all options from wp_options
 */
register_uninstall_hook(__FILE__, 'pdf_lazy_loader_uninstall');
function pdf_lazy_loader_uninstall() {
    $options = array(
        'pdf_lazy_loader_button_color',
        'pdf_lazy_loader_button_color_hover',
        'pdf_lazy_loader_loading_time',
        'pdf_lazy_loader_enable_download',
        'pdf_lazy_loader_facade_height_desktop',
        'pdf_lazy_loader_facade_height_tablet',
        'pdf_lazy_loader_facade_height_mobile',
        'pdf_lazy_loader_enable_turnstile',
        'pdf_lazy_loader_turnstile_site_key',
        'pdf_lazy_loader_turnstile_secret_key',
        'pdf_lazy_loader_debug_mode',
    );
    foreach ($options as $option) {
        delete_option($option);
    }
}
