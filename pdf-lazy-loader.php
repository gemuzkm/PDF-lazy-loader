<?php
/**
 * Plugin Name: PDF Lazy Loader
 * Plugin URI: https://github.com/your-username/pdf-lazy-loader
 * Description: Optimizes PDF loading with lazy loading pattern for better performance and user experience. Replaces PDF iframes with a preview facade that loads the actual PDF only when user clicks.
 * Version: 1.0.6
 * Author: Your Name
 * Author URI: https://example.com
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

// Hook into WordPress admin
add_action('admin_menu', 'pdf_lazy_loader_add_admin_menu');
add_action('admin_init', 'pdf_lazy_loader_register_settings');
add_action('admin_enqueue_scripts', 'pdf_lazy_loader_enqueue_admin_scripts');
add_action('wp_enqueue_scripts', 'pdf_lazy_loader_enqueue_frontend_scripts');
add_filter('pre_update_option_pdf_lazy_loader_enable_download', 'pdf_lazy_loader_update_checkbox', 10, 2);

/**
 * Add admin menu page
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
 * Register settings
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
}

/**
 * Sanitize checkbox value
 */
function pdf_lazy_loader_sanitize_checkbox($value) {
    return $value === '1' || $value === 1 || $value === true;
}

/**
 * Update checkbox option - handle unchecked state
 */
function pdf_lazy_loader_update_checkbox($value, $old_value) {
    // Check if this is a form submission from our settings page
    // WordPress settings API includes 'option_page' in POST when form is submitted
    $is_form_submission = isset($_POST['option_page']) && 
                         $_POST['option_page'] === 'pdf_lazy_loader_settings' &&
                         isset($_POST['_wpnonce']);
    
    if ($is_form_submission) {
        // Form submission: checkbox is checked if present in POST, unchecked if not
        // WordPress doesn't send unchecked checkboxes in POST
        if (!isset($_POST['pdf_lazy_loader_enable_download'])) {
            return false;
        }
        // Checkbox is checked, validate the value
        return $value === '1' || $value === 1 || $value === true;
    }
    
    // Programmatic update (via update_option, REST API, etc.): use the $value parameter directly
    // Convert various truthy values to boolean
    if ($value === '1' || $value === 1 || $value === true || $value === 'true') {
        return true;
    }
    if ($value === '0' || $value === 0 || $value === false || $value === 'false' || $value === null || $value === '') {
        return false;
    }
    
    // Default: return as boolean
    return (bool) $value;
}

/**
 * Get plugin settings
 */
function pdf_lazy_loader_get_settings() {
    return array(
        'buttonColor' => get_option('pdf_lazy_loader_button_color', '#FF6B6B'),
        'buttonColorHover' => get_option('pdf_lazy_loader_button_color_hover', '#E63946'),
        'loadingTime' => intval(get_option('pdf_lazy_loader_loading_time', 1500)),
        'enableDownload' => (bool) get_option('pdf_lazy_loader_enable_download', false),
    );
}

/**
 * Enqueue admin scripts
 */
function pdf_lazy_loader_enqueue_admin_scripts($hook) {
    // Only enqueue on our settings page
    if ($hook !== 'settings_page_pdf-lazy-loader-settings') {
        return;
    }

    // Get current settings
    $settings = pdf_lazy_loader_get_settings();

    // Enqueue admin CSS
    wp_enqueue_style(
        'pdf-lazy-loader-admin',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/css/admin.css',
        array(),
        PDF_LAZY_LOADER_VERSION
    );

    // Enqueue admin script
    wp_enqueue_script(
        'pdf-lazy-loader-admin',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/admin.js',
        array('jquery'),
        PDF_LAZY_LOADER_VERSION,
        true
    );

    // Localize script with settings - CRITICAL FIX
    wp_localize_script(
        'pdf-lazy-loader-admin',
        'pdfLazyLoaderAdmin',
        $settings
    );
}

/**
 * Enqueue frontend scripts
 */
function pdf_lazy_loader_enqueue_frontend_scripts() {
    // Get current settings
    $settings = pdf_lazy_loader_get_settings();

    // Enqueue frontend script
    wp_enqueue_script(
        'pdf-lazy-loader',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/pdf-lazy-loader.js',
        array(),
        PDF_LAZY_LOADER_VERSION,
        true
    );

    // Localize script with settings
    wp_localize_script(
        'pdf-lazy-loader',
        'pdfLazyLoaderData',
        $settings
    );
}

/**
 * Settings page HTML
 */
function pdf_lazy_loader_settings_page() {
    if (!current_user_can('manage_options')) {
        wp_die(__('You do not have sufficient permissions to access this page.'));
    }

    $settings = pdf_lazy_loader_get_settings();
    ?>
    <div class="wrap pdf-lazy-loader-settings">
        <h1><?php echo esc_html(get_admin_page_title()); ?></h1>

        <?php settings_errors(); ?>

        <form method="post" action="options.php">
            <?php settings_fields('pdf_lazy_loader_settings'); ?>

            <table class="form-table">
                <!-- Button Color -->
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

                <!-- Button Hover Color -->
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

                <!-- Loading Time -->
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

                <!-- Download Button -->
                <tr>
                    <th scope="row">
                        <label for="pdf_lazy_loader_enable_download">Show Download Button</label>
                    </th>
                    <td>
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
            </table>

            <?php submit_button('Save Changes', 'primary', 'submit'); ?>
        </form>

        <!-- Preview Section -->
        <div class="pdf-lazy-loader-info">
            <h2>Preview</h2>
            <p>This is how your PDF will look with current settings:</p>
            <div id="pdf-lazy-loader-preview"></div>
        </div>

        <!-- About Section -->
        <div class="pdf-lazy-loader-info">
            <h2>About PDF Lazy Loader</h2>
            <p>Optimizes PDF loading with lazy loading pattern for better performance and user experience.</p>
            <p><strong>Version:</strong> <?php echo esc_html(PDF_LAZY_LOADER_VERSION); ?></p>
        </div>
    </div>
    <?php
}

// Add custom styles to admin
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

// Plugin activation hook
register_activation_hook(__FILE__, 'pdf_lazy_loader_activation');

function pdf_lazy_loader_activation() {
    // Set default values if not already set
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
