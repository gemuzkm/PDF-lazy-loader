<?php
/**
 * Plugin Name: PDF Lazy Loader
 * Plugin URI: https://carfusepro.com
 * Description: Оптимизация загрузки PDF файлов с использованием паттерна Facade и ленивой загрузки. Совместим с Redis Object Cache и FlyingPress.
 * Version: 1.0.0
 * Author: CarFusePro
 * Author URI: https://carfusepro.com
 * License: MIT
 * License URI: https://opensource.org/licenses/MIT
 * Text Domain: pdf-lazy-loader
 * Domain Path: /languages
 * Requires at least: 5.0
 * Requires PHP: 7.4
 * Network: false
 */

// Защита от прямого доступа
if (!defined('ABSPATH')) {
    exit;
}

// ============================================
// КОНСТАНТЫ ПЛАГИНА
// ============================================

define('PDF_LAZY_LOADER_VERSION', '1.0.0');
define('PDF_LAZY_LOADER_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PDF_LAZY_LOADER_PLUGIN_URL', plugin_dir_url(__FILE__));
define('PDF_LAZY_LOADER_PLUGIN_BASENAME', plugin_basename(__FILE__));

// ============================================
// КЛАСС ПЛАГИНА
// ============================================

class PDF_Lazy_Loader {

    /**
     * Версия плагина
     *
     * @var string
     */
    private $version = PDF_LAZY_LOADER_VERSION;

    /**
     * Путь к плагину
     *
     * @var string
     */
    private $plugin_dir = PDF_LAZY_LOADER_PLUGIN_DIR;

    /**
     * URL плагина
     *
     * @var string
     */
    private $plugin_url = PDF_LAZY_LOADER_PLUGIN_URL;

    /**
     * Параметры плагина
     *
     * @var array
     */
    private $options = [];

    /**
     * Использовать Redis кеш
     *
     * @var bool
     */
    private $use_redis = false;

    /**
     * Использовать FlyingPress
     *
     * @var bool
     */
    private $use_flying_press = false;

    /**
     * Singleton экземпляр
     *
     * @var PDF_Lazy_Loader
     */
    private static $instance = null;

    /**
     * Получить singleton экземпляр
     *
     * @return PDF_Lazy_Loader
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Конструктор
     */
    private function __construct() {
        $this->check_dependencies();
        $this->load_options();
        $this->init_hooks();
    }

    /**
     * Проверка зависимостей
     */
    private function check_dependencies() {
        // Проверяем Redis Object Cache
        $this->use_redis = defined('OBJECT_CACHE_REDIS_ENABLED') || 
                          class_exists('WP_Object_Cache') || 
                          function_exists('wp_cache_get');

        // Проверяем FlyingPress
        $this->use_flying_press = function_exists('flying_press') || 
                                  class_exists('Flying_Press');
    }

    /**
     * Загрузить параметры плагина
     */
    private function load_options() {
        $defaults = [
            'enabled' => true,
            'enable_on_mobile' => true,
            'button_color' => '#FF6B6B',
            'button_color_hover' => '#E63946',
            'loading_time' => 1500,
            'enable_analytics' => true,
            'cache_duration' => 7 * DAY_IN_SECONDS,
            'exclude_pages' => '',
            'include_only_pages' => '',
            'debug_mode' => false,
        ];

        $stored = get_option('pdf_lazy_loader_settings', []);
        $this->options = wp_parse_args($stored, $defaults);
    }

    /**
     * Инициализация хуков
     */
    private function init_hooks() {
        // Регистрация
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
        register_uninstall_hook(__FILE__, [__CLASS__, 'uninstall']);

        // Фронтенд
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('wp_footer', [$this, 'inject_script'], 100);

        // Админ
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_scripts']);

        // AJAX
        add_action('wp_ajax_pdf_lazy_loader_stats', [$this, 'ajax_stats']);
        add_action('wp_ajax_nopriv_pdf_lazy_loader_stats', [$this, 'ajax_stats']);

        // Совместимость с кешами
        add_action('flying_press_after_cache_purge', [$this, 'clear_cache']);
        add_action('wp_cache_flush', [$this, 'clear_cache']);

        // Плагины
        add_filter('plugin_action_links_' . PDF_LAZY_LOADER_PLUGIN_BASENAME, [$this, 'add_action_links']);
        add_filter('plugin_row_meta', [$this, 'add_plugin_row_meta'], 10, 2);
    }

    /**
     * Активация плагина
     */
    public function activate() {
        // Создаём таблицу для статистики (если нужна)
        $this->create_tables();

        // Добавляем параметры по умолчанию
        if (!get_option('pdf_lazy_loader_settings')) {
            update_option('pdf_lazy_loader_settings', []);
        }

        // Очищаем кеши
        if (function_exists('wp_cache_flush')) {
            wp_cache_flush();
        }

        // Уведомление FlyingPress
        if (function_exists('flying_press')) {
            do_action('flying_press_after_update');
        }

        // Логируем активацию
        $this->log('Plugin activated');
    }

    /**
     * Деактивация плагина
     */
    public function deactivate() {
        // Очищаем кеши при деактивации
        if (function_exists('wp_cache_flush')) {
            wp_cache_flush();
        }

        $this->log('Plugin deactivated');
    }

    /**
     * Удаление плагина
     */
    public static function uninstall() {
        // Удаляем параметры
        delete_option('pdf_lazy_loader_settings');
        delete_option('pdf_lazy_loader_stats');

        // Очищаем кеши
        if (function_exists('wp_cache_flush')) {
            wp_cache_flush();
        }
    }

    /**
     * Создание таблиц базы данных
     */
    private function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table_name = $wpdb->prefix . 'pdf_lazy_loader_stats';

        $sql = "CREATE TABLE IF NOT EXISTS $table_name (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            pdf_url VARCHAR(500) NOT NULL,
            views BIGINT(20) UNSIGNED DEFAULT 0,
            downloads BIGINT(20) UNSIGNED DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY pdf_url_idx (pdf_url(255)),
            KEY created_at_idx (created_at)
        ) $charset_collate;";

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
    }

    /**
     * Инжектировать основной скрипт
     */
    public function inject_script() {
        // Проверяем, нужно ли инжектировать
        if (!$this->should_inject_script()) {
            return;
        }

        // Проверяем кеш
        $script_cached = $this->get_cached_script();
        if ($script_cached) {
            echo $script_cached; // WPCS: XSS OK - вывод кеша
            return;
        }

        // Генерируем скрипт
        ob_start();
        include $this->plugin_dir . 'assets/js/pdf-lazy-loader.php';
        $script = ob_get_clean();

        // Кешируем скрипт
        $this->cache_script($script);

        echo $script; // WPCS: XSS OK
    }

    /**
     * Проверить, нужно ли инжектировать скрипт
     *
     * @return bool
     */
    private function should_inject_script() {
        // Проверяем, активирован ли плагин
        if (!$this->options['enabled']) {
            return false;
        }

        // Не инжектируем в админке
        if (is_admin()) {
            return false;
        }

        // Проверяем исключённые страницы
        if ($this->is_excluded_page()) {
            return false;
        }

        return true;
    }

    /**
     * Проверить, исключена ли текущая страница
     *
     * @return bool
     */
    private function is_excluded_page() {
        if (empty($this->options['exclude_pages'])) {
            return false;
        }

        $current_post_id = get_the_ID();
        if (!$current_post_id) {
            return false;
        }

        $excluded_pages = array_map('trim', explode(',', $this->options['exclude_pages']));
        return in_array($current_post_id, $excluded_pages, true);
    }

    /**
     * Получить кешированный скрипт
     *
     * @return string|false
     */
    private function get_cached_script() {
        $cache_key = 'pdf_lazy_loader_script_v' . $this->version;

        if ($this->use_redis) {
            return wp_cache_get($cache_key, 'pdf_lazy_loader');
        }

        // Fallback на transient
        return get_transient($cache_key);
    }

    /**
     * Кешировать скрипт
     *
     * @param string $script
     */
    private function cache_script($script) {
        $cache_key = 'pdf_lazy_loader_script_v' . $this->version;
        $cache_time = $this->options['cache_duration'];

        if ($this->use_redis) {
            wp_cache_set($cache_key, $script, 'pdf_lazy_loader', $cache_time);
        } else {
            set_transient($cache_key, $script, $cache_time);
        }
    }

    /**
     * Очистить кеш
     */
    public function clear_cache() {
        $cache_key = 'pdf_lazy_loader_script_v' . $this->version;

        if ($this->use_redis) {
            wp_cache_delete($cache_key, 'pdf_lazy_loader');
        } else {
            delete_transient($cache_key);
        }

        // Логируем очистку
        $this->log('Cache cleared');
    }

    /**
     * Подключить стили и скрипты в админ
     *
     * @param string $page
     */
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

        wp_localize_script('pdf-lazy-loader-admin', 'pdfLazyLoaderAdmin', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('pdf_lazy_loader_nonce'),
            'redisEnabled' => $this->use_redis,
            'flyingPressEnabled' => $this->use_flying_press,
        ]);
    }

    /**
     * Подключить стили и скрипты на фронтенд
     */
    public function enqueue_scripts() {
        if (!$this->should_inject_script()) {
            return;
        }

        // Локализуем переменные для скрипта
        $localized_data = [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('pdf_lazy_loader_nonce'),
            'debugMode' => $this->options['debug_mode'],
            'buttonColor' => $this->options['button_color'],
        ];

        wp_localize_script('pdf-lazy-loader', 'pdfLazyLoaderData', $localized_data);
    }

    /**
     * Добавить меню администратора
     */
    public function add_admin_menu() {
        add_options_page(
            __('PDF Lazy Loader Settings', 'pdf-lazy-loader'),
            __('PDF Lazy Loader', 'pdf-lazy-loader'),
            'manage_options',
            'pdf-lazy-loader',
            [$this, 'render_settings_page']
        );
    }

    /**
     * Регистрация параметров
     */
    public function register_settings() {
        register_setting('pdf_lazy_loader_settings', 'pdf_lazy_loader_settings', [
            'type' => 'array',
            'sanitize_callback' => [$this, 'sanitize_settings'],
        ]);

        add_settings_section(
            'pdf_lazy_loader_main',
            __('PDF Lazy Loader Settings', 'pdf-lazy-loader'),
            [$this, 'render_settings_section'],
            'pdf_lazy_loader_settings'
        );
    }

    /**
     * Санитизация параметров
     *
     * @param array $settings
     * @return array
     */
    public function sanitize_settings($settings) {
        $sanitized = [];

        $sanitized['enabled'] = isset($settings['enabled']) ? (bool) $settings['enabled'] : true;
        $sanitized['enable_on_mobile'] = isset($settings['enable_on_mobile']) ? (bool) $settings['enable_on_mobile'] : true;
        $sanitized['button_color'] = isset($settings['button_color']) ? sanitize_hex_color($settings['button_color']) : '#FF6B6B';
        $sanitized['button_color_hover'] = isset($settings['button_color_hover']) ? sanitize_hex_color($settings['button_color_hover']) : '#E63946';
        $sanitized['loading_time'] = isset($settings['loading_time']) ? absint($settings['loading_time']) : 1500;
        $sanitized['enable_analytics'] = isset($settings['enable_analytics']) ? (bool) $settings['enable_analytics'] : true;
        $sanitized['cache_duration'] = isset($settings['cache_duration']) ? absint($settings['cache_duration']) : 7 * DAY_IN_SECONDS;
        $sanitized['exclude_pages'] = isset($settings['exclude_pages']) ? sanitize_textarea_field($settings['exclude_pages']) : '';
        $sanitized['debug_mode'] = isset($settings['debug_mode']) ? (bool) $settings['debug_mode'] : false;

        return $sanitized;
    }

    /**
     * Отрендерить страницу параметров
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized');
        }

        ?>
        <div class="wrap pdf-lazy-loader-settings">
            <h1><?php esc_html_e('PDF Lazy Loader Settings', 'pdf-lazy-loader'); ?></h1>

            <div class="pdf-lazy-loader-info">
                <div class="info-box">
                    <h2><?php esc_html_e('Plugin Status', 'pdf-lazy-loader'); ?></h2>
                    <p>
                        <strong><?php esc_html_e('Version:', 'pdf-lazy-loader'); ?></strong> 
                        <?php echo esc_html($this->version); ?>
                    </p>
                    <p>
                        <strong><?php esc_html_e('Redis Cache:', 'pdf-lazy-loader'); ?></strong>
                        <?php echo $this->use_redis ? '<span class="status-active">✓ Active</span>' : '<span class="status-inactive">✗ Inactive</span>'; ?>
                    </p>
                    <p>
                        <strong><?php esc_html_e('FlyingPress:', 'pdf-lazy-loader'); ?></strong>
                        <?php echo $this->use_flying_press ? '<span class="status-active">✓ Active</span>' : '<span class="status-inactive">✗ Inactive</span>'; ?>
                    </p>
                </div>
            </div>

            <form method="POST" action="options.php">
                <?php settings_fields('pdf_lazy_loader_settings'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="pdf_lazy_loader_enabled">
                                <?php esc_html_e('Enable Plugin', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <input 
                                type="checkbox" 
                                id="pdf_lazy_loader_enabled" 
                                name="pdf_lazy_loader_settings[enabled]" 
                                value="1" 
                                <?php checked($this->options['enabled'], 1); ?>
                            >
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="pdf_lazy_loader_button_color">
                                <?php esc_html_e('Button Color', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <input 
                                type="color" 
                                id="pdf_lazy_loader_button_color" 
                                name="pdf_lazy_loader_settings[button_color]" 
                                value="<?php echo esc_attr($this->options['button_color']); ?>"
                            >
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="pdf_lazy_loader_loading_time">
                                <?php esc_html_e('Loading Animation Time (ms)', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <input 
                                type="number" 
                                id="pdf_lazy_loader_loading_time" 
                                name="pdf_lazy_loader_settings[loading_time]" 
                                value="<?php echo esc_attr($this->options['loading_time']); ?>"
                                min="500"
                                max="5000"
                            >
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="pdf_lazy_loader_debug">
                                <?php esc_html_e('Debug Mode', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <input 
                                type="checkbox" 
                                id="pdf_lazy_loader_debug" 
                                name="pdf_lazy_loader_settings[debug_mode]" 
                                value="1" 
                                <?php checked($this->options['debug_mode'], 1); ?>
                            >
                            <p class="description">
                                <?php esc_html_e('Enable logging to debug issues', 'pdf-lazy-loader'); ?>
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">
                            <label for="pdf_lazy_loader_exclude">
                                <?php esc_html_e('Exclude Pages (by ID)', 'pdf-lazy-loader'); ?>
                            </label>
                        </th>
                        <td>
                            <textarea 
                                id="pdf_lazy_loader_exclude" 
                                name="pdf_lazy_loader_settings[exclude_pages]" 
                                rows="3"
                                style="width: 300px;"
                            ><?php echo esc_textarea($this->options['exclude_pages']); ?></textarea>
                            <p class="description">
                                <?php esc_html_e('Enter page IDs separated by commas', 'pdf-lazy-loader'); ?>
                            </p>
                        </td>
                    </tr>
                </table>

                <?php submit_button(); ?>
            </form>

            <div class="pdf-lazy-loader-docs">
                <h2><?php esc_html_e('Documentation', 'pdf-lazy-loader'); ?></h2>
                <p><?php esc_html_e('For more information, visit:', 'pdf-lazy-loader'); ?> 
                    <a href="https://carfusepro.com" target="_blank">carfusepro.com</a>
                </p>
            </div>
        </div>
        <?php
    }

    /**
     * Отрендерить секцию параметров
     */
    public function render_settings_section() {
        echo '<p>' . esc_html__('Configure PDF Lazy Loader settings below', 'pdf-lazy-loader') . '</p>';
    }

    /**
     * AJAX обработчик статистики
     */
    public function ajax_stats() {
        check_ajax_referer('pdf_lazy_loader_nonce');

        global $wpdb;
        $table_name = $wpdb->prefix . 'pdf_lazy_loader_stats';

        $stats = $wpdb->get_results(
            "SELECT * FROM $table_name ORDER BY views DESC LIMIT 10"
        );

        wp_send_json_success(['stats' => $stats]);
    }

    /**
     * Добавить ссылки действий в плагины
     *
     * @param array $links
     * @return array
     */
    public function add_action_links($links) {
        $settings_link = '<a href="' . admin_url('options-general.php?page=pdf-lazy-loader') . '">' 
                        . esc_html__('Settings', 'pdf-lazy-loader') . '</a>';
        array_unshift($links, $settings_link);
        return $links;
    }

    /**
     * Добавить мета информацию в плагины
     *
     * @param array $links
     * @param string $file
     * @return array
     */
    public function add_plugin_row_meta($links, $file) {
        if ($file !== PDF_LAZY_LOADER_PLUGIN_BASENAME) {
            return $links;
        }

        $links[] = '<a href="https://carfusepro.com" target="_blank">' . esc_html__('Documentation', 'pdf-lazy-loader') . '</a>';
        return $links;
    }

    /**
     * Логирование
     *
     * @param string $message
     * @param string $level
     */
    private function log($message, $level = 'info') {
        if (!$this->options['debug_mode']) {
            return;
        }

        $log_file = WP_CONTENT_DIR . '/pdf-lazy-loader.log';
        $timestamp = date('Y-m-d H:i:s');
        $log_message = "[$timestamp] [$level] $message\n";

        error_log($log_message, 3, $log_file);
    }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ ПЛАГИНА
// ============================================

function pdf_lazy_loader_init() {
    PDF_Lazy_Loader::get_instance();
}

add_action('plugins_loaded', 'pdf_lazy_loader_init', 10);

// ============================================
// ГЛОБАЛЬНАЯ ФУНКЦИЯ
// ============================================

/**
 * Получить экземпляр плагина
 *
 * @return PDF_Lazy_Loader
 */
function pdf_lazy_loader() {
    return PDF_Lazy_Loader::get_instance();
}
