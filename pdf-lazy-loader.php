<?php
/**
 * Plugin Name: PDF Lazy Loader
 * Plugin URI: https://github.com/your-username/pdf-lazy-loader
 * Description: Optimizes PDF loading with lazy loading pattern for better performance and user experience. Replaces PDF iframes with a preview facade that loads the actual PDF only when user clicks. Includes URL encryption, Cloudflare Turnstile protection, and responsive design.
 * Version: 1.0.6
 * Author: Your TM
 * Author URI: https://procarmanuals.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: pdf-lazy-loader
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 * Requires PHP: 7.2
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PDF_LAZY_LOADER_VERSION', '1.0.6');
define('PDF_LAZY_LOADER_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PDF_LAZY_LOADER_PLUGIN_URL', plugin_dir_url(__FILE__));

add_action('admin_menu', 'pdf_lazy_loader_add_admin_menu');
add_action('admin_init', 'pdf_lazy_loader_register_settings');
add_action('admin_enqueue_scripts', 'pdf_lazy_loader_enqueue_admin_scripts');
add_action('wp_enqueue_scripts', 'pdf_lazy_loader_enqueue_frontend_scripts');
add_action('wp_head', 'pdf_lazy_loader_add_inline_script', 1);
add_filter('pre_update_option_pdf_lazy_loader_enable_download', 'pdf_lazy_loader_update_checkbox', 10, 2);
add_filter('the_content', 'pdf_lazy_loader_filter_content', 999);
add_filter('widget_text', 'pdf_lazy_loader_filter_content', 999);
add_filter('widget_block_content', 'pdf_lazy_loader_filter_content', 999);
add_filter('rest_prepare_post', 'pdf_lazy_loader_filter_rest_content', 999, 3);

/**
 * Add admin menu page for plugin settings
 * Creates a submenu item under Settings → PDF Lazy Loader
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
 * Registers settings for button colors, loading time, download option,
 * responsive facade heights, Cloudflare Turnstile, and debug mode
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
 * Converts various checkbox input formats to boolean
 *
 * @param mixed $value The checkbox value to sanitize
 * @return bool True if value is '1', 1, or true, false otherwise
 */
function pdf_lazy_loader_sanitize_checkbox($value) {
    return $value === '1' || $value === 1 || $value === true;
}

/**
 * Update checkbox option - handle unchecked state
 * WordPress doesn't send unchecked checkboxes in POST, so we need to handle this
 * This ensures unchecked checkboxes are properly saved as false
 *
 * @param mixed $value The new value being saved
 * @param mixed $old_value The previous value
 * @return bool The sanitized boolean value
 */
function pdf_lazy_loader_update_checkbox($value, $old_value) {
    $option_page = isset($_POST['option_page']) ? sanitize_text_field($_POST['option_page']) : '';
    $wpnonce = isset($_POST['_wpnonce']) ? sanitize_text_field($_POST['_wpnonce']) : '';
    $is_form_submission = $option_page === 'pdf_lazy_loader_settings' && !empty($wpnonce);
    if ($is_form_submission) {
        $post_value = isset($_POST['pdf_lazy_loader_enable_download']) 
            ? sanitize_text_field($_POST['pdf_lazy_loader_enable_download']) 
            : '0';
        return $post_value === '1' || $post_value === 1 || $post_value === true;
    }
    if ($value === '1' || $value === 1 || $value === true || $value === 'true') {
        return true;
    }
    if ($value === '0' || $value === 0 || $value === false || $value === 'false' || $value === null || $value === '') {
        return false;
    }
    return (bool) $value;
}

/**
 * Get all plugin settings with proper type conversion
 * Retrieves settings from WordPress options and converts them to proper types
 * (strings to booleans/integers as needed)
 *
 * @return array Associative array of all plugin settings:
 *               - buttonColor: Hex color for View PDF button
 *               - buttonColorHover: Hex color for button hover state
 *               - loadingTime: Animation duration in milliseconds (500-5000)
 *               - enableDownload: Whether download button is shown
 *               - facadeHeightDesktop: Facade height for desktop (≥1024px), default 600px
 *               - facadeHeightTablet: Facade height for tablet (768px-1023px), default 500px
 *               - facadeHeightMobile: Facade height for mobile (<768px), default 400px
 *               - enableTurnstile: Whether Cloudflare Turnstile is enabled
 *               - turnstileSiteKey: Cloudflare Turnstile site key
 *               - debugMode: Whether debug logging is enabled
 */
function pdf_lazy_loader_get_settings() {
    $enableDownload = get_option('pdf_lazy_loader_enable_download', false);
    if ($enableDownload === '1' || $enableDownload === 1 || $enableDownload === true) {
        $enableDownload = true;
    } else {
        $enableDownload = false;
    }
    $enableTurnstile = get_option('pdf_lazy_loader_enable_turnstile', false);
    if ($enableTurnstile === '1' || $enableTurnstile === 1 || $enableTurnstile === true) {
        $enableTurnstile = true;
    } else {
        $enableTurnstile = false;
    }
    $debugMode = get_option('pdf_lazy_loader_debug_mode', false);
    if ($debugMode === '1' || $debugMode === 1 || $debugMode === true) {
        $debugMode = true;
    } else {
        $debugMode = false;
    }
    return array(
        'buttonColor' => get_option('pdf_lazy_loader_button_color', '#FF6B6B'),
        'buttonColorHover' => get_option('pdf_lazy_loader_button_color_hover', '#E63946'),
        'loadingTime' => intval(get_option('pdf_lazy_loader_loading_time', 1500)),
        'enableDownload' => $enableDownload,
        'facadeHeightDesktop' => intval(get_option('pdf_lazy_loader_facade_height_desktop', 600)),
        'facadeHeightTablet' => intval(get_option('pdf_lazy_loader_facade_height_tablet', 500)),
        'facadeHeightMobile' => intval(get_option('pdf_lazy_loader_facade_height_mobile', 400)),
        'enableTurnstile' => $enableTurnstile,
        'turnstileSiteKey' => sanitize_text_field(get_option('pdf_lazy_loader_turnstile_site_key', '')),
        'debugMode' => $debugMode,
    );
}

/**
 * Enqueue admin scripts and styles
 * Only loads on the plugin's settings page to improve performance
 *
 * @param string $hook The current admin page hook
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
    wp_localize_script(
        'pdf-lazy-loader-admin',
        'pdfLazyLoaderAdmin',
        $settings
    );
}

/**
 * Encrypt URL using XOR cipher and base64 encoding
 * Uses the same algorithm as JavaScript for compatibility
 * Algorithm: XOR cipher with key 'pdf-lazy-loader-secure-key-2024', then Base64 encode
 * This prevents PDF URLs from being visible in page source code
 *
 * @param string $url The URL to encrypt
 * @return string Base64-encoded encrypted URL, or empty string if URL is empty
 */
function pdf_lazy_loader_encrypt_url($url) {
    if (empty($url)) {
        return '';
    }
    $encryption_key = 'pdf-lazy-loader-secure-key-2024';
    $encrypted = '';
    for ($i = 0; $i < strlen($url); $i++) {
        $key_char = $encryption_key[$i % strlen($encryption_key)];
        $encrypted .= chr(ord($url[$i]) ^ ord($key_char));
    }
    return base64_encode($encrypted);
}

/**
 * Check if URL is a PDF-related URL
 * Detects various PDF indicators including file extensions, MIME types, and PDF viewer URLs
 *
 * @param string $url The URL to check
 * @return bool True if URL appears to be PDF-related, false otherwise
 */
function pdf_lazy_loader_is_pdf_url($url) {
    if (empty($url)) {
        return false;
    }
    $pdf_indicators = array(
        '.pdf',
        'application/pdf',
        'pdf-embedder',
        'pdfembed',
        'pdfemb-data',
        'pdfjs',
        'viewer.html'
    );
    foreach ($pdf_indicators as $indicator) {
        if (strpos($url, $indicator) !== false) {
            return true;
        }
    }
    return false;
}

/**
 * Filter content to remove PDF iframe src and encrypt it
 * Server-side filtering that runs before HTML is sent to browser
 * This is the first line of defense against scrapers - removes PDF URLs from source code
 * Applied to: the_content, widget_text, widget_block_content filters
 *
 * Process:
 * 1. Finds all iframe tags in content
 * 2. Checks if src contains PDF indicators
 * 3. Encrypts the src URL using XOR + Base64
 * 4. Removes src attribute and stores encrypted URL in data-pdf-lazy-original-src-enc
 * 5. Adds data-pdf-lazy-intercepted="1" marker
 *
 * @param string $content The content to filter
 * @return string Filtered content with encrypted PDF iframe src attributes
 */
function pdf_lazy_loader_filter_content($content) {
    if (is_admin()) {
        return $content;
    }
    if (empty($content) || strpos($content, '<iframe') === false) {
        return $content;
    }
    $pattern = '/<iframe([^>]*?)>/is';
    $content = preg_replace_callback($pattern, function($matches) {
        $attributes = $matches[1];
        if (preg_match('/\ssrc\s*=\s*["\']([^"\']*?)["\']/i', $attributes, $src_match)) {
            $src = $src_match[1];
            if (pdf_lazy_loader_is_pdf_url($src)) {
                $encrypted_src = pdf_lazy_loader_encrypt_url($src);
                $new_attributes = preg_replace('/\ssrc\s*=\s*["\'][^"\']*?["\']/i', '', $attributes);
                $new_attributes = trim($new_attributes);
                if (!empty($new_attributes)) {
                    $new_attributes = ' ' . $new_attributes;
                }
                $new_attributes .= ' data-pdf-lazy-original-src-enc="' . esc_attr($encrypted_src) . '"';
                $new_attributes .= ' data-pdf-lazy-intercepted="1"';
                return '<iframe' . $new_attributes . '>';
            }
        }
        return $matches[0];
    }, $content);
    return $content;
}

/**
 * Filter REST API content
 * Applies the same PDF URL encryption to REST API responses
 * Ensures PDF URLs are encrypted even when content is accessed via REST API
 *
 * @param WP_REST_Response $response The REST API response object
 * @param WP_Post $post The post object
 * @param WP_REST_Request $request The REST API request object
 * @return WP_REST_Response Modified response with encrypted PDF URLs
 */
function pdf_lazy_loader_filter_rest_content($response, $post, $request) {
    if (is_wp_error($response)) {
        return $response;
    }
    if (isset($response->data['content']['rendered'])) {
        $response->data['content']['rendered'] = pdf_lazy_loader_filter_content($response->data['content']['rendered']);
    }
    return $response;
}

/**
 * Add inline script in head to prevent PDF loading immediately
 * This must run before any iframes start loading (priority 1)
 * Only runs on frontend, not in admin
 *
 * Client-side interception strategy:
 * 1. Immediately intercepts existing PDF iframes before they load
 * 2. Uses MutationObserver to catch dynamically added iframes
 * 3. Removes src attribute and stores encrypted URL in data attribute
 * 4. Multiple execution strategies ensure early interception
 *
 * This prevents network requests for PDF URLs before the main script processes them
 */
function pdf_lazy_loader_add_inline_script() {
    if (is_admin()) {
        return;
    }
    ?>
    <script type="text/javascript">
    (function() {
        'use strict';
        function interceptPDFIframe(iframe) {
            const src = iframe.getAttribute('src') || '';
            if (src && (
                src.includes('.pdf') || 
                src.includes('application/pdf') || 
                src.includes('pdf-embedder') || 
                src.includes('pdfembed') || 
                src.includes('pdfemb-data') ||
                src.includes('pdfjs') ||
                src.includes('viewer.html')
            )) {
                if (!iframe.hasAttribute('data-pdf-lazy-original-src-enc')) {
                    try {
                        const encodedSrc = btoa(unescape(encodeURIComponent(src)));
                        iframe.setAttribute('data-pdf-lazy-original-src-enc', encodedSrc);
                    } catch (e) {
                        iframe.setAttribute('data-pdf-lazy-original-src-enc', btoa(src));
                    }
                    iframe.removeAttribute('src');
                    iframe.setAttribute('data-pdf-lazy-intercepted', '1');
                    return true; 
                }
            }
            return false; 
        }
        function interceptPDFIframes() {
            const iframes = document.querySelectorAll('iframe');
            let intercepted = 0;
            iframes.forEach(function(iframe) {
                if (interceptPDFIframe(iframe)) {
                    intercepted++;
                }
            });
                if (intercepted > 0) {
                    const debugMode = document.body && document.body.getAttribute('data-pdf-debug') === '1';
                    if (debugMode) {
                        console.log('[PDF Interceptor] Intercepted ' + intercepted + ' PDF iframe(s)');
                    }
                }
        }
        if (document.body) {
            interceptPDFIframes();
        } else if (document.documentElement) {
            interceptPDFIframes();
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', interceptPDFIframes, { once: true });
        }
        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(function(mutations) {
                let intercepted = 0;
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) { 
                            if (node.tagName === 'IFRAME') {
                                if (interceptPDFIframe(node)) {
                                    intercepted++;
                                }
                            }
                            if (node.querySelectorAll) {
                                const nestedIframes = node.querySelectorAll('iframe');
                                nestedIframes.forEach(function(iframe) {
                                    if (interceptPDFIframe(iframe)) {
                                        intercepted++;
                                    }
                                });
                            }
                        }
                    });
                });
                if (intercepted > 0) {
                    const debugMode = document.body && document.body.getAttribute('data-pdf-debug') === '1';
                    if (debugMode) {
                        console.log('[PDF Interceptor] Intercepted ' + intercepted + ' new PDF iframe(s)');
                    }
                }
            });
            const target = document.body || document.documentElement || document;
            if (target) {
                observer.observe(target, {
                    childList: true,
                    subtree: true
                });
            }
        }
    })();
    </script>
    <?php
}

/**
 * Enqueue frontend scripts and styles
 * Loads the main JavaScript file and CSS for PDF lazy loading functionality
 * Only runs on frontend, not in admin
 * Note: Cloudflare Turnstile script is loaded dynamically only when user clicks View/Download
 * This improves page load performance and only loads Turnstile when needed
 */
function pdf_lazy_loader_enqueue_frontend_scripts() {
    if (is_admin()) {
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
    wp_localize_script(
        'pdf-lazy-loader',
        'pdfLazyLoaderData',
        $settings
    );
}

/**
 * Render the plugin settings page
 * Displays all configuration options in WordPress admin
 * Includes sections for:
 * - Basic settings (button colors, loading time, download option)
 * - Responsive facade heights (desktop, tablet, mobile)
 * - Cloudflare Turnstile protection
 * - Debug mode
 */
function pdf_lazy_loader_settings_page() {
    if (!current_user_can('manage_options')) {
        wp_die(__('You do not have sufficient permissions to access this page.'));
    }
    $settings = pdf_lazy_loader_get_settings();
    ?>
    <div class="wrap pdf-lazy-loader-settings">
        <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
        <?php 
        settings_errors('pdf_lazy_loader_settings');
        ?>
        <form method="post" action="options.php">
            <?php settings_fields('pdf_lazy_loader_settings'); ?>
            <table class="form-table">

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_button_color">Button Color</label>
                    </th>
                    <td>
                        <input
                            type="color"
                            id="pdf_lazy_loader_button_color"
                            name="pdf_lazy_loader_button_color"
                            value="<?php echo esc_attr($settings['buttonColor']); ?>"
                        />
                        <span class="description">Color of the View PDF button</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_button_color_hover">Button Hover Color</label>
                    </th>
                    <td>
                        <input
                            type="color"
                            id="pdf_lazy_loader_button_color_hover"
                            name="pdf_lazy_loader_button_color_hover"
                            value="<?php echo esc_attr($settings['buttonColorHover']); ?>"
                        />
                        <span class="description">Color on hover</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_loading_time">Loading Animation Duration (ms)</label>
                    </th>
                    <td>
                        <input
                            type="number"
                            id="pdf_lazy_loader_loading_time"
                            name="pdf_lazy_loader_loading_time"
                            value="<?php echo esc_attr($settings['loadingTime']); ?>"
                            min="500"
                            max="5000"
                            step="100"
                        />
                        <span class="description">Duration of loading animation (500-5000 ms)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_enable_download">Show Download Button</label>
                    </th>
                    <td>

                        <input
                            type="hidden"
                            name="pdf_lazy_loader_enable_download"
                            value="0"
                        />
                        <input
                            type="checkbox"
                            id="pdf_lazy_loader_enable_download"
                            name="pdf_lazy_loader_enable_download"
                            value="1"
                            <?php checked($settings['enableDownload'], true); ?>
                        />
                        <span class="description">Allow users to download PDF files</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_facade_height_desktop">Facade Height - Desktop (px)</label>
                    </th>
                    <td>
                        <input
                            type="number"
                            id="pdf_lazy_loader_facade_height_desktop"
                            name="pdf_lazy_loader_facade_height_desktop"
                            value="<?php echo esc_attr($settings['facadeHeightDesktop']); ?>"
                            min="200"
                            max="2000"
                            step="10"
                        />
                        <span class="description">Height of the facade on desktop devices (≥1024px)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_facade_height_tablet">Facade Height - Tablet (px)</label>
                    </th>
                    <td>
                        <input
                            type="number"
                            id="pdf_lazy_loader_facade_height_tablet"
                            name="pdf_lazy_loader_facade_height_tablet"
                            value="<?php echo esc_attr($settings['facadeHeightTablet']); ?>"
                            min="200"
                            max="1500"
                            step="10"
                        />
                        <span class="description">Height of the facade on tablet devices (768px-1023px)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_facade_height_mobile">Facade Height - Mobile (px)</label>
                    </th>
                    <td>
                        <input
                            type="number"
                            id="pdf_lazy_loader_facade_height_mobile"
                            name="pdf_lazy_loader_facade_height_mobile"
                            value="<?php echo esc_attr($settings['facadeHeightMobile']); ?>"
                            min="200"
                            max="1000"
                            step="10"
                        />
                        <span class="description">Height of the facade on mobile devices (&lt;768px)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row" colspan="2">
                        <h2 style="margin: 20px 0 10px 0;">Cloudflare Turnstile Protection</h2>
                    </th>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_enable_turnstile">Enable Turnstile</label>
                    </th>
                    <td>

                        <input
                            type="hidden"
                            name="pdf_lazy_loader_enable_turnstile"
                            value="0"
                        />
                        <input
                            type="checkbox"
                            id="pdf_lazy_loader_enable_turnstile"
                            name="pdf_lazy_loader_enable_turnstile"
                            value="1"
                            <?php checked($settings['enableTurnstile'], true); ?>
                        />
                        <span class="description">Enable Cloudflare Turnstile verification before viewing/downloading PDF</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_turnstile_site_key">Turnstile Site Key</label>
                    </th>
                    <td>
                        <input
                            type="text"
                            id="pdf_lazy_loader_turnstile_site_key"
                            name="pdf_lazy_loader_turnstile_site_key"
                            value="<?php echo esc_attr($settings['turnstileSiteKey']); ?>"
                            class="regular-text"
                            placeholder="1x00000000000000000000AA"
                        />
                        <span class="description">Your Cloudflare Turnstile Site Key (<a href="https:
                    </td>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_turnstile_secret_key">Turnstile Secret Key</label>
                    </th>
                    <td>
                        <input
                            type="password"
                            id="pdf_lazy_loader_turnstile_secret_key"
                            name="pdf_lazy_loader_turnstile_secret_key"
                            value="<?php echo esc_attr(get_option('pdf_lazy_loader_turnstile_secret_key', '')); ?>"
                            class="regular-text"
                            placeholder="1x0000000000000000000000000000000AA"
                        />
                        <span class="description">Your Cloudflare Turnstile Secret Key (stored securely, used for server-side verification)</span>
                    </td>
                </tr>

                <tr>
                    <th scope="row" colspan="2">
                        <h2 style="margin: 20px 0 10px 0;">Debug Settings</h2>
                    </th>
                </tr>

                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_debug_mode">Enable Debug Mode</label>
                    </th>
                    <td>

                        <input
                            type="hidden"
                            name="pdf_lazy_loader_debug_mode"
                            value="0"
                        />
                        <input
                            type="checkbox"
                            id="pdf_lazy_loader_debug_mode"
                            name="pdf_lazy_loader_debug_mode"
                            value="1"
                            <?php checked($settings['debugMode'], true); ?>
                        />
                        <span class="description">Enable detailed console logging for debugging. Disable in production to reduce console noise.</span>
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
 * Add custom admin styles
 * Styles the settings page for better UX
 */
add_action('admin_head', 'pdf_lazy_loader_admin_styles');
function pdf_lazy_loader_admin_styles() {
    ?>
    <style>
        .pdf-lazy-loader-settings {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
        }
        .pdf-lazy-loader-settings h1 {
            margin-bottom: 30px;
            color: #333;
        }
        .pdf-lazy-loader-settings .form-table {
            margin-bottom: 30px;
        }
        .pdf-lazy-loader-settings .form-table tr {
            border-bottom: 1px solid #eee;
        }
        .pdf-lazy-loader-settings .form-table th {
            width: 200px;
            text-align: left;
            padding: 20px 0;
            background: #f9f9f9;
        }
        .pdf-lazy-loader-settings .form-table td {
            padding: 20px 0;
        }
        .pdf-lazy-loader-settings input[type="color"] {
            width: 60px;
            height: 40px;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
        }
        .pdf-lazy-loader-settings input[type="number"] {
            width: 120px;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .pdf-lazy-loader-settings input[type="checkbox"] {
            width: 20px;
            height: 20px;
            cursor: pointer;
        }
        .pdf-lazy-loader-settings .description {
            display: block;
            color: #666;
            font-size: 12px;
            margin-top: 6px;
        }
        .pdf-lazy-loader-info {
            background: #f9f9f9;
            padding: 20px;
            border-radius: 8px;
            margin-top: 30px;
            border: 1px solid #eee;
        }
        .pdf-lazy-loader-info h2 {
            color: #333;
            margin-top: 0;
            margin-bottom: 15px;
        }
        .pdf-lazy-loader-info p {
            color: #666;
            margin: 10px 0;
        }
        #pdf-lazy-loader-preview {
            margin: 20px 0;
        }
        @media (max-width: 768px) {
            .pdf-lazy-loader-settings .form-table th {
                display: block;
                width: 100%;
                margin-bottom: 10px;
            }
            .pdf-lazy-loader-settings .form-table td {
                display: block;
                width: 100%;
            }
            .pdf-lazy-loader-settings .form-table tr {
                display: block;
                margin-bottom: 20px;
                padding-bottom: 20px;
            }
        }
    </style>
    <?php
}

/**
 * Plugin activation hook
 * Sets default values for plugin options on activation
 * Only sets defaults if options don't already exist
 */
register_activation_hook(__FILE__, 'pdf_lazy_loader_activation');
function pdf_lazy_loader_activation() {
    if (!get_option('pdf_lazy_loader_button_color')) {
        update_option('pdf_lazy_loader_button_color', '#FF6B6B');
    }
    if (!get_option('pdf_lazy_loader_button_color_hover')) {
        update_option('pdf_lazy_loader_button_color_hover', '#E63946');
    }
    if (!get_option('pdf_lazy_loader_loading_time')) {
        update_option('pdf_lazy_loader_loading_time', '1500');
    }
}
?>