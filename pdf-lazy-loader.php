<?php
/**
 * Plugin Name: PDF Lazy Loader
 * Plugin URI: https://carfusepro.com
 * Description: Optimize PDF loading with lazy loading pattern. Simple and secure.
 * Version: 1.0.4
 * Author: CarFusePro
 * Author URI: https://carfusepro.com
 * License: MIT
 * License URI: https://opensource.org/licenses/MIT
 * Text Domain: pdf-lazy-loader
 * Domain Path: /languages
 * Requires at least: 5.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PDF_LAZY_LOADER_VERSION', '1.0.4');
define('PDF_LAZY_LOADER_DIR', plugin_dir_path(__FILE__));
define('PDF_LAZY_LOADER_URL', plugin_dir_url(__FILE__));
define('PDF_LAZY_LOADER_BASENAME', plugin_basename(__FILE__));

class PDF_Lazy_Loader {
    private $version = PDF_LAZY_LOADER_VERSION;
    private $plugin_dir = PDF_LAZY_LOADER_DIR;
    private $plugin_url = PDF_LAZY_LOADER_URL;
    private $options = [];
    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->load_options();
        $this->init_hooks();
    }

    private function load_options() {
        $defaults = [
            'button_color' => '#FF6B6B',
            'button_color_hover' => '#E63946',
            'loading_time' => 1500,
            'enable_download' => true,
        ];

        $stored = get_option('pdf_lazy_loader_settings', []);
        $this->options = wp_parse_args($stored, $defaults);
    }

    private function init_hooks() {
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);

        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('wp_footer', [$this, 'inject_script'], 100);

        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_scripts']);

        add_filter('plugin_action_links_' . PDF_LAZY_LOADER_BASENAME, [$this, 'add_action_links']);
    }

    public function activate() {
        if (!get_option('pdf_lazy_loader_settings')) {
            update_option('pdf_lazy_loader_settings', []);
        }
    }

    public function deactivate() {
        if (function_exists('wp_cache_flush')) {
            wp_cache_flush();
        }
    }

    public function inject_script() {
        if (is_admin()) {
            return;
        }
        ob_start();
        include $this->plugin_dir . 'assets/js/pdf-lazy-loader.js';
        $script = ob_get_clean();
        echo '<script>' . $script . '</script>';
    }

    public function enqueue_admin_scripts($page) {
        if (strpos($page, 'pdf-lazy-loader') === false) {
            return;
        }

        wp_enqueue_style(
            'pdf-lazy-loader-admin',
            $this->plugin_url . 'assets/css/admin.css',
            [],
            $this->version
        );

        wp_enqueue_script(
            'pdf-lazy-loader-admin',
            $this->plugin_url . 'assets/js/admin.js',
            ['jquery'],
            $this->version,
            true
        );
    }

    public function enqueue_scripts() {
        $localized_data = [
            'buttonColor' => $this->options['button_color'],
            'buttonColorHover' => $this->options['button_color_hover'],
            'loadingTime' => (int) $this->options['loading_time'],
            'enableDownload' => (bool) $this->options['enable_download'],
        ];
        wp_localize_script('pdf-lazy-loader', 'pdfLazyLoaderData', $localized_data);
    }

    public function add_admin_menu() {
        add_options_page(
            __('PDF Lazy Loader Settings', 'pdf-lazy-loader'),
            __('PDF Lazy Loader', 'pdf-lazy-loader'),
            'manage_options',
            'pdf-lazy-loader',
            [$this, 'render_settings_page']
        );
    }

    public function register_settings() {
        register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_settings', [
            'type' => 'array',
            'sanitize_callback' => [$this, 'sanitize_settings'],
        ]);
    }

    public function sanitize_settings($settings) {
        $sanitized = [];

        $sanitized['button_color'] = isset($settings['button_color']) 
            ? sanitize_hex_color($settings['button_color']) 
            : '#FF6B6B';

        $sanitized['button_color_hover'] = isset($settings['button_color_hover']) 
            ? sanitize_hex_color($settings['button_color_hover']) 
            : '#E63946';

        $sanitized['loading_time'] = isset($settings['loading_time']) 
            ? max(500, min(5000, absint($settings['loading_time']))) 
            : 1500;

        // CRITICAL FIX: Check for explicit value '1'
        $sanitized['enable_download'] = isset($settings['enable_download']) 
            && $settings['enable_download'] === '1' 
            ? true 
            : false;

        return $sanitized;
    }

    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }

        $enable_download = isset($this->options['enable_download']) 
            ? $this->options['enable_download'] 
            : true;
        ?>
        <div class="wrap pdf-lazy-loader-settings">
            <h1><?php esc_html_e('PDF Lazy Loader Settings', 'pdf-lazy-loader'); ?></h1>

            <form method="POST" action="options.php">
                <?php settings_fields('pdf_lazy_loader_settings'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="pdf_button_color">
                                <?php esc_html_e('Button Color', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <input 
                                type="color" 
                                id="pdf_button_color" 
                                name="pdf_lazy_loader_settings[button_color]" 
                                value="<?php echo esc_attr($this->options['button_color']); ?>"
                            >
                            <p class="description">
                                <?php esc_html_e('Color of the View PDF button', 'pdf-lazy-loader'); ?>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="pdf_button_color_hover">
                                <?php esc_html_e('Button Hover Color', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <input 
                                type="color" 
                                id="pdf_button_color_hover" 
                                name="pdf_lazy_loader_settings[button_color_hover]" 
                                value="<?php echo esc_attr($this->options['button_color_hover']); ?>"
                            >
                            <p class="description">
                                <?php esc_html_e('Color on hover', 'pdf-lazy-loader'); ?>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="pdf_loading_time">
                                <?php esc_html_e('Loading Animation Duration (ms)', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <input 
                                type="number" 
                                id="pdf_loading_time" 
                                name="pdf_lazy_loader_settings[loading_time]" 
                                value="<?php echo esc_attr($this->options['loading_time']); ?>"
                                min="500"
                                max="5000"
                                step="100"
                            >
                            <p class="description">
                                <?php esc_html_e('Duration of loading animation (500-5000 ms)', 'pdf-lazy-loader'); ?>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="pdf_enable_download">
                                <?php esc_html_e('Show Download Button', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <input 
                                type="checkbox" 
                                id="pdf_enable_download" 
                                name="pdf_lazy_loader_settings[enable_download]" 
                                value="1"
                                <?php checked($enable_download, true); ?>
                            >
                            <p class="description">
                                <?php esc_html_e('Allow users to download PDF files', 'pdf-lazy-loader'); ?>
                            </p>
                        </td>
                    </tr>
                </table>

                <?php submit_button(); ?>
            </form>

            <div class="pdf-lazy-loader-info">
                <h2><?php esc_html_e('About PDF Lazy Loader', 'pdf-lazy-loader'); ?></h2>
                <p><?php esc_html_e('Optimizes PDF loading with lazy loading pattern for better performance and user experience.', 'pdf-lazy-loader'); ?></p>
                <p><strong><?php esc_html_e('Version:', 'pdf-lazy-loader'); ?></strong> <?php echo esc_html($this->version); ?></p>
            </div>
        </div>
        <?php
    }

    public function add_action_links($links) {
        $settings_link = '<a href="' . admin_url('options-general.php?page=pdf-lazy-loader') . '">' 
                        . esc_html__('Settings', 'pdf-lazy-loader') . '</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}

function pdf_lazy_loader_init() {
    PDF_Lazy_Loader::get_instance();
}

add_action('plugins_loaded', 'pdf_lazy_loader_init', 10);
