<?php
/**
 * Plugin Name: PDF Lazy Loader
 * Plugin URI: https://github.com/gemuzkm/pdf-lazy-loader
 * Description: Defers PDF Embedder output behind a lightweight click-to-load facade with optional Cloudflare Turnstile check. No PDF/viewer assets are loaded until the visitor clicks "View PDF".
 * Version: 1.2.0
 * Author: Your TM
 * Author URI: https://procarmanuals.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: pdf-lazy-loader
 * Domain Path: /languages
 * Requires at least: 5.7
 * Tested up to: 7.1
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'PDF_LAZY_LOADER_VERSION',      '1.2.0' );
define( 'PDF_LAZY_LOADER_DB_VERSION',   '2' );
define( 'PDF_LAZY_LOADER_DEFAULT_WAIT', 300 );
define( 'PDF_LAZY_LOADER_PLUGIN_DIR',   plugin_dir_path( __FILE__ ) );
define( 'PDF_LAZY_LOADER_PLUGIN_URL',   plugin_dir_url( __FILE__ ) );

$GLOBALS['pdf_lazy_loader_has_pdfs']      = false;
$GLOBALS['pdf_lazy_loader_ob_active']     = false;
$GLOBALS['pdf_lazy_loader_facade_index']  = 0;
$GLOBALS['pdf_lazy_loader_pdfemb_assets'] = array( 'css' => array(), 'js' => array() );

// Settings / admin
add_action( 'admin_menu',            'pdf_lazy_loader_add_admin_menu' );
add_action( 'admin_init',            'pdf_lazy_loader_register_settings' );
add_action( 'admin_enqueue_scripts', 'pdf_lazy_loader_enqueue_admin_scripts' );
add_action( 'plugins_loaded',        'pdf_lazy_loader_maybe_upgrade' );

// Frontend
add_action( 'wp_head',            'pdf_lazy_loader_add_inline_script', 1 );
// Layer 1 — dequeue whatever was registered before shortcodes ran
add_action( 'wp_enqueue_scripts', 'pdf_lazy_loader_dequeue_pdfemb_assets', 999 );
// Our own assets — after Layer 1 so the early list is complete
add_action( 'wp_enqueue_scripts', 'pdf_lazy_loader_enqueue_frontend_scripts', 1000 );
// Layer 2 — after ALL shortcodes executed, collect late-enqueued assets
add_action( 'wp_footer', 'pdf_lazy_loader_scan_all_pdfemb_registered', 1 );
// Layer 3 — fallback output of the asset list (only when ob_start is not active)
add_action( 'wp_footer', 'pdf_lazy_loader_inject_assets_to_footer', 2 );
// ob_start: strip surviving PDF Embedder tags and print the final asset list once
add_action( 'template_redirect', 'pdf_lazy_loader_start_output_buffer', 1 );

// Checkbox save hooks
add_filter( 'pre_update_option_pdf_lazy_loader_enable_download',  'pdf_lazy_loader_update_checkbox', 10, 2 );
add_filter( 'pre_update_option_pdf_lazy_loader_enable_turnstile', 'pdf_lazy_loader_update_checkbox', 10, 2 );
add_filter( 'pre_update_option_pdf_lazy_loader_debug_mode',       'pdf_lazy_loader_update_checkbox', 10, 2 );

// Content
add_filter( 'the_content',          'pdf_lazy_loader_filter_content', 999 );
add_filter( 'widget_text',          'pdf_lazy_loader_filter_content', 999 );
add_filter( 'widget_block_content', 'pdf_lazy_loader_filter_content', 999 );
add_action( 'rest_api_init',        'pdf_lazy_loader_register_rest_filters' );

// ---------------------------------------------------------------------------
// Upgrade routine (runs once per DB version)
// v2: old default spinner delay 1500 ms -> 300 ms (delay now runs in parallel
// with asset loading). Custom values other than 1500 are left untouched.
// ---------------------------------------------------------------------------
function pdf_lazy_loader_maybe_upgrade() {
    if ( get_option( 'pdf_lazy_loader_db_version' ) === PDF_LAZY_LOADER_DB_VERSION ) return;
    if ( (int) get_option( 'pdf_lazy_loader_loading_time', 0 ) === 1500 ) {
        update_option( 'pdf_lazy_loader_loading_time', PDF_LAZY_LOADER_DEFAULT_WAIT );
    }
    update_option( 'pdf_lazy_loader_db_version', PDF_LAZY_LOADER_DB_VERSION );
}

// ---------------------------------------------------------------------------
// Inline <script> helper — wp_get_inline_script_tag() (WP 5.7+) applies the
// wp_inline_script_attributes filter (CSP nonce support) and correct attributes.
// ---------------------------------------------------------------------------
function pdf_lazy_loader_inline_script_tag( $js, $attrs = array() ) {
    if ( function_exists( 'wp_get_inline_script_tag' ) ) {
        return wp_get_inline_script_tag( $js, $attrs );
    }
    return '<script>' . $js . "</script>\n";
}

// ---------------------------------------------------------------------------
// Helper: is this src/href from a PDF Embedder plugin?
// ---------------------------------------------------------------------------
function pdf_lazy_loader_is_pdfemb_src( $src ) {
    if ( empty( $src ) || ! is_string( $src ) ) return false;
    $markers = array(
        '/PDFEmbedder-premium-secure/',
        '/PDFEmbedder-premium/',
        '/pdf-embedder-premium/',
        '/pdf-embedder/',
        '/pdfemb/',
    );
    foreach ( $markers as $m ) {
        if ( stripos( $src, $m ) !== false ) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Build the final asset URL the same way WP_Scripts / WP_Styles would:
// base_url for relative paths, ?ver= (default_version when ver === false),
// and the script_loader_src / style_loader_src filters.
// ---------------------------------------------------------------------------
function pdf_lazy_loader_build_asset_url( $dep, $deps_obj, $type ) {
    $src = $dep->src;
    if ( ! $src || ! is_string( $src ) ) return '';

    if ( ! preg_match( '|^(https?:)?//|', $src ) && ! ( $deps_obj->content_url && 0 === strpos( $src, $deps_obj->content_url ) ) ) {
        $src = $deps_obj->base_url . $src;
    }

    $ver = $dep->ver;
    if ( $ver === false ) $ver = $deps_obj->default_version;
    if ( $ver !== null && $ver !== '' ) {
        $src = add_query_arg( 'ver', $ver, $src );
    }

    $src = apply_filters( $type === 'css' ? 'style_loader_src' : 'script_loader_src', $src, $dep->handle );
    return $src ? html_entity_decode( $src, ENT_QUOTES ) : '';
}

// ---------------------------------------------------------------------------
// Collect one style handle (plus its PDF Embedder deps) into the asset list
// and dequeue it. Non-PDF-Embedder deps stay enqueued.
// ---------------------------------------------------------------------------
function pdf_lazy_loader_collect_style( $handle, &$list, &$seen ) {
    global $wp_styles;
    if ( isset( $seen[ $handle ] ) || ! isset( $wp_styles->registered[ $handle ] ) ) return;
    $seen[ $handle ] = true;
    $dep = $wp_styles->registered[ $handle ];

    foreach ( (array) $dep->deps as $d ) {
        if ( isset( $wp_styles->registered[ $d ] ) && pdf_lazy_loader_is_pdfemb_src( $wp_styles->registered[ $d ]->src ) ) {
            pdf_lazy_loader_collect_style( $d, $list, $seen );
        } else {
            wp_enqueue_style( $d );
        }
    }

    $href = pdf_lazy_loader_build_asset_url( $dep, $wp_styles, 'css' );
    if ( $href ) {
        $after = $wp_styles->get_data( $handle, 'after' );
        $list[ $href ] = array(
            'href'   => $href,
            'media'  => $dep->args ? $dep->args : 'all',
            'inline' => is_array( $after ) ? implode( "\n", $after ) : '',
        );
    }
    wp_dequeue_style( $handle );
    wp_deregister_style( $handle );
}

// ---------------------------------------------------------------------------
// Collect one script handle (plus its PDF Embedder deps, in dependency order)
// with its wp_localize_script() 'data' and wp_add_inline_script() before/after.
// Non-PDF-Embedder deps (e.g. jquery) are kept enqueued so the deferred script
// finds them on click.
// ---------------------------------------------------------------------------
function pdf_lazy_loader_collect_script( $handle, &$list, &$seen ) {
    global $wp_scripts;
    if ( isset( $seen[ $handle ] ) || ! isset( $wp_scripts->registered[ $handle ] ) ) return;
    $seen[ $handle ] = true;
    $dep = $wp_scripts->registered[ $handle ];

    foreach ( (array) $dep->deps as $d ) {
        if ( isset( $wp_scripts->registered[ $d ] ) && pdf_lazy_loader_is_pdfemb_src( $wp_scripts->registered[ $d ]->src ) ) {
            pdf_lazy_loader_collect_script( $d, $list, $seen );
        } else {
            wp_enqueue_script( $d );
        }
    }

    $src = pdf_lazy_loader_build_asset_url( $dep, $wp_scripts, 'js' );
    if ( $src ) {
        $data   = $wp_scripts->get_data( $handle, 'data' );
        $before = $wp_scripts->get_data( $handle, 'before' );
        $after  = $wp_scripts->get_data( $handle, 'after' );
        $list[ $src ] = array(
            'src'    => $src,
            'before' => trim( ( $data ? $data . "\n" : '' ) . ( is_array( $before ) ? implode( "\n", array_filter( $before ) ) : '' ) ),
            'after'  => is_array( $after ) ? implode( "\n", array_filter( $after ) ) : '',
        );
    }
    wp_dequeue_script( $handle );
    wp_deregister_script( $handle );
}

// Shared implementation for Layer 1 and Layer 2 — only QUEUED handles are
// collected, so registered-but-unused files (e.g. the free plugin's pdf.js when
// Premium renders the shortcode) are never downloaded on click.
function pdf_lazy_loader_collect_queued_pdfemb_assets() {
    global $wp_styles, $wp_scripts;

    $css = array();
    foreach ( (array) $GLOBALS['pdf_lazy_loader_pdfemb_assets']['css'] as $a ) $css[ $a['href'] ] = $a;
    $js = array();
    foreach ( (array) $GLOBALS['pdf_lazy_loader_pdfemb_assets']['js'] as $a ) $js[ $a['src'] ] = $a;

    if ( $wp_styles instanceof WP_Styles ) {
        $seen = array();
        foreach ( (array) $wp_styles->queue as $h ) {
            if ( isset( $wp_styles->registered[ $h ] ) && pdf_lazy_loader_is_pdfemb_src( $wp_styles->registered[ $h ]->src ) ) {
                pdf_lazy_loader_collect_style( $h, $css, $seen );
            }
        }
    }
    if ( $wp_scripts instanceof WP_Scripts ) {
        $seen = array();
        foreach ( (array) $wp_scripts->queue as $h ) {
            if ( isset( $wp_scripts->registered[ $h ] ) && pdf_lazy_loader_is_pdfemb_src( $wp_scripts->registered[ $h ]->src ) ) {
                pdf_lazy_loader_collect_script( $h, $js, $seen );
            }
        }
    }

    $GLOBALS['pdf_lazy_loader_pdfemb_assets'] = array(
        'css' => array_values( $css ),
        'js'  => array_values( $js ),
    );
}

// Layer 1 — wp_enqueue_scripts:999
function pdf_lazy_loader_dequeue_pdfemb_assets() {
    if ( is_admin() || ! pdf_lazy_loader_has_pdf_iframes() ) return;
    pdf_lazy_loader_collect_queued_pdfemb_assets();
}

// Layer 2 — wp_footer:1 (PDF Embedder Premium enqueues pdf-fullscreen inside
// render(), i.e. during the_content — this is where it is caught).
function pdf_lazy_loader_scan_all_pdfemb_registered() {
    if ( is_admin() || ! pdf_lazy_loader_has_pdf_iframes() ) return;
    pdf_lazy_loader_collect_queued_pdfemb_assets();
}

// Final asset list as an inline script. 'before' snippets (localized data such
// as pdfemb_trans) are printed immediately — they are tiny and must exist
// before the deferred file runs; 'after' snippets are executed on click.
function pdf_lazy_loader_assets_script_html( $assets ) {
    if ( empty( $assets['css'] ) && empty( $assets['js'] ) ) return '';
    $out    = '';
    $before = array();
    foreach ( $assets['js'] as $i => $a ) {
        if ( ! empty( $a['before'] ) ) $before[] = $a['before'];
        unset( $assets['js'][ $i ]['before'] );
    }
    if ( $before ) {
        $out .= pdf_lazy_loader_inline_script_tag( implode( "\n", $before ), array( 'id' => 'pdf-lazy-loader-pdfemb-data' ) );
    }
    $out .= pdf_lazy_loader_inline_script_tag(
        'window.pdfLazyLoaderLateAssets=' . wp_json_encode( $assets ) . ';',
        array( 'id' => 'pdf-lazy-loader-late-assets' )
    );
    return $out;
}

// Layer 3 — wp_footer:2. Only used when the output buffer is NOT active;
// otherwise the buffer callback prints the (possibly extended) list exactly once.
function pdf_lazy_loader_inject_assets_to_footer() {
    if ( is_admin() || ! pdf_lazy_loader_has_pdf_iframes() ) return;
    if ( ! empty( $GLOBALS['pdf_lazy_loader_ob_active'] ) ) return;
    echo pdf_lazy_loader_assets_script_html( $GLOBALS['pdf_lazy_loader_pdfemb_assets'] ); // phpcs:ignore WordPress.Security.EscapeOutput
}

// ---------------------------------------------------------------------------
// ob_start — strip PDF Embedder <link>/<script src> printed outside the queue
// ---------------------------------------------------------------------------
function pdf_lazy_loader_start_output_buffer() {
    if ( is_admin() || wp_doing_ajax() || is_feed() ) return;
    if ( ! pdf_lazy_loader_has_pdf_iframes() ) return;
    $GLOBALS['pdf_lazy_loader_ob_active'] = true;
    ob_start( 'pdf_lazy_loader_filter_html_output' );
}

function pdf_lazy_loader_filter_html_output( $html ) {
    if ( empty( $html ) ) return $html;

    $assets = $GLOBALS['pdf_lazy_loader_pdfemb_assets'];

    // Fast path: no PDF Embedder asset paths anywhere in the document
    if ( stripos( $html, 'pdfemb' ) !== false || stripos( $html, 'pdf-embedder' ) !== false ) {
        $known_css = array();
        foreach ( $assets['css'] as $a ) $known_css[ $a['href'] ] = true;
        $known_js = array();
        foreach ( $assets['js'] as $a ) $known_js[ $a['src'] ] = true;

        // One pass for both <link href> and <script src></script>
        $pattern = '#<(link|script)\b[^>]*\b(?:href|src)=["\']([^"\']*(?:/PDFEmbedder-premium(?:-secure)?/|/pdf-embedder(?:-premium)?/|/pdfemb/)[^"\']*)["\'][^>]*>(?:\s*</script>)?\s*#i';

        $html = preg_replace_callback( $pattern, function( $m ) use ( &$assets, &$known_css, &$known_js ) {
            $tag = strtolower( $m[1] );
            $url = html_entity_decode( $m[2], ENT_QUOTES );
            if ( $tag === 'link' ) {
                if ( ! preg_match( '#\brel=["\']?(?:stylesheet|preload)#i', $m[0] ) ) return $m[0];
                if ( ! isset( $known_css[ $url ] ) ) {
                    $media = preg_match( '#\bmedia=["\']([^"\']+)#i', $m[0], $mm ) ? $mm[1] : 'all';
                    $assets['css'][]   = array( 'href' => $url, 'media' => $media, 'inline' => '' );
                    $known_css[ $url ] = true;
                }
            } else {
                if ( ! isset( $known_js[ $url ] ) ) {
                    $assets['js'][]   = array( 'src' => $url, 'before' => '', 'after' => '' );
                    $known_js[ $url ] = true;
                }
            }
            return '';
        }, $html );
    }

    $script = pdf_lazy_loader_assets_script_html( $assets );
    if ( $script !== '' ) {
        $pos = strripos( $html, '</body>' );
        $html = ( $pos !== false ) ? substr_replace( $html, $script, $pos, 0 ) : $html . $script;
    }
    return $html;
}

// ---------------------------------------------------------------------------
// Admin menu
// ---------------------------------------------------------------------------
function pdf_lazy_loader_add_admin_menu() {
    add_options_page(
        __( 'PDF Lazy Loader Settings', 'pdf-lazy-loader' ), 'PDF Lazy Loader', 'manage_options',
        'pdf-lazy-loader-settings', 'pdf_lazy_loader_settings_page'
    );
}

// ---------------------------------------------------------------------------
// Settings registration
// ---------------------------------------------------------------------------
function pdf_lazy_loader_register_settings() {
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_button_color',           array( 'type' => 'string',  'sanitize_callback' => 'sanitize_hex_color', 'default' => '#FF6B6B' ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_button_color_hover',      array( 'type' => 'string',  'sanitize_callback' => 'sanitize_hex_color', 'default' => '#E63946' ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_loading_time',            array( 'type' => 'integer', 'sanitize_callback' => 'pdf_lazy_loader_sanitize_loading_time', 'default' => PDF_LAZY_LOADER_DEFAULT_WAIT ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_enable_download',         array( 'type' => 'boolean', 'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox', 'default' => false ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_desktop',   array( 'type' => 'integer', 'sanitize_callback' => 'absint',             'default' => 600 ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_tablet',    array( 'type' => 'integer', 'sanitize_callback' => 'absint',             'default' => 500 ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_facade_height_mobile',    array( 'type' => 'integer', 'sanitize_callback' => 'absint',             'default' => 400 ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_enable_turnstile',        array( 'type' => 'boolean', 'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox', 'default' => false ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_turnstile_site_key',      array( 'type' => 'string',  'sanitize_callback' => 'sanitize_text_field', 'default' => '' ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_turnstile_secret_key',    array( 'type' => 'string',  'sanitize_callback' => 'sanitize_text_field', 'default' => '' ) );
    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_debug_mode',              array( 'type' => 'boolean', 'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox', 'default' => false ) );
}

function pdf_lazy_loader_sanitize_loading_time( $value ) {
    return max( 0, min( 5000, absint( $value ) ) );
}

function pdf_lazy_loader_sanitize_checkbox( $value ) {
    return $value === '1' || $value === 1 || $value === true;
}

function pdf_lazy_loader_update_checkbox( $value, $old_value ) {
    // Nonce is already verified by options.php (settings_fields() -> check_admin_referer)
    // before update_option() fires this filter; we only read the posted value here.
    // phpcs:disable WordPress.Security.NonceVerification.Missing
    $option_page = isset( $_POST['option_page'] ) ? sanitize_text_field( wp_unslash( $_POST['option_page'] ) ) : '';
    $wpnonce     = isset( $_POST['_wpnonce'] )    ? sanitize_text_field( wp_unslash( $_POST['_wpnonce'] ) )    : '';
    if ( $option_page === 'pdf_lazy_loader_settings' && ! empty( $wpnonce ) ) {
        $option_name = str_replace( 'pre_update_option_', '', current_filter() );
        $post_value  = isset( $_POST[ $option_name ] ) ? sanitize_text_field( wp_unslash( $_POST[ $option_name ] ) ) : '0';
        return $post_value === '1';
    }
    // phpcs:enable
    return $value === '1' || $value === 1 || $value === true || $value === 'true';
}

// ---------------------------------------------------------------------------
// Settings reader (memoized per request)
// ---------------------------------------------------------------------------
function pdf_lazy_loader_get_settings() {
    static $settings = null;
    if ( $settings !== null ) return $settings;
    $to_bool  = function( $v ) { return $v === '1' || $v === 1 || $v === true; };
    $settings = array(
        'buttonColor'         => get_option( 'pdf_lazy_loader_button_color', '#FF6B6B' ),
        'buttonColorHover'    => get_option( 'pdf_lazy_loader_button_color_hover', '#E63946' ),
        'loadingTime'         => intval( get_option( 'pdf_lazy_loader_loading_time', PDF_LAZY_LOADER_DEFAULT_WAIT ) ),
        'enableDownload'      => $to_bool( get_option( 'pdf_lazy_loader_enable_download', false ) ),
        'facadeHeightDesktop' => intval( get_option( 'pdf_lazy_loader_facade_height_desktop', 600 ) ),
        'facadeHeightTablet'  => intval( get_option( 'pdf_lazy_loader_facade_height_tablet',  500 ) ),
        'facadeHeightMobile'  => intval( get_option( 'pdf_lazy_loader_facade_height_mobile',  400 ) ),
        'enableTurnstile'     => $to_bool( get_option( 'pdf_lazy_loader_enable_turnstile', false ) ),
        'turnstileSiteKey'    => sanitize_text_field( get_option( 'pdf_lazy_loader_turnstile_site_key', '' ) ),
        'debugMode'           => $to_bool( get_option( 'pdf_lazy_loader_debug_mode', false ) ),
    );
    return $settings;
}

// Translatable facade strings — shared by the server-side facade and JS fallback
function pdf_lazy_loader_get_i18n() {
    return array(
        'title'        => __( 'PDF Document', 'pdf-lazy-loader' ),
        'subtitle'     => __( 'Click the button below to load the document', 'pdf-lazy-loader' ),
        'view'         => __( 'View PDF', 'pdf-lazy-loader' ),
        'download'     => __( 'Download', 'pdf-lazy-loader' ),
        'info'         => __( 'Document will be loaded on first access', 'pdf-lazy-loader' ),
        'loading'      => __( 'Loading PDF...', 'pdf-lazy-loader' ),
        'verify'       => __( 'Please complete verification to continue', 'pdf-lazy-loader' ),
        'verifyFailed' => __( 'Verification failed.', 'pdf-lazy-loader' ),
        'verifyExpired'=> __( 'Verification expired.', 'pdf-lazy-loader' ),
        'verifyError'  => __( 'Verification error. Refresh the page.', 'pdf-lazy-loader' ),
        'verifyLoad'   => __( 'Failed to load verification.', 'pdf-lazy-loader' ),
    );
}

// ---------------------------------------------------------------------------
// Admin enqueue
// ---------------------------------------------------------------------------
function pdf_lazy_loader_enqueue_admin_scripts( $hook ) {
    if ( $hook !== 'settings_page_pdf-lazy-loader-settings' ) return;
    $settings = pdf_lazy_loader_get_settings();
    wp_enqueue_style(  'pdf-lazy-loader-admin', PDF_LAZY_LOADER_PLUGIN_URL . 'assets/css/admin.css', array(), PDF_LAZY_LOADER_VERSION );
    wp_enqueue_script( 'pdf-lazy-loader-admin', PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/admin.js',  array( 'jquery' ), PDF_LAZY_LOADER_VERSION, true );
    wp_add_inline_script(
        'pdf-lazy-loader-admin',
        'var pdfLazyLoaderAdmin = ' . wp_json_encode( $settings ) . ';',
        'before'
    );
}

// ---------------------------------------------------------------------------
// URL obfuscation (XOR + Base64).
// NOTE: this is obfuscation against naive HTML parsers, NOT encryption —
// the key is public and decoding happens in the browser.
// ---------------------------------------------------------------------------
function pdf_lazy_loader_encrypt_url( $url ) {
    if ( empty( $url ) ) return '';
    $key     = 'pdf-lazy-loader-secure-key-2024';
    $key_len = strlen( $key );
    $out     = '';
    for ( $i = 0, $len = strlen( $url ); $i < $len; $i++ ) {
        $out .= chr( ord( $url[ $i ] ) ^ ord( $key[ $i % $key_len ] ) );
    }
    return base64_encode( $out ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
}

// ---------------------------------------------------------------------------
// PDF URL detection
// ---------------------------------------------------------------------------
function pdf_lazy_loader_is_pdf_url( $url ) {
    if ( empty( $url ) ) return false;
    $indicators = array( '.pdf', 'application/pdf', 'pdf-embedder', 'pdfembed', 'pdfemb-data', 'pdfjs', 'viewer.html' );
    $lower = strtolower( $url );
    foreach ( $indicators as $ind ) {
        if ( strpos( $lower, $ind ) !== false ) return true;
    }
    return false;
}

// Real PDF file URL behind a viewer URL. PDF Embedder Premium encodes the
// shortcode attributes as base64url JSON in ?pdfemb-data= (no padding, -_).
function pdf_lazy_loader_resolve_pdf_url( $src ) {
    $src   = html_entity_decode( $src, ENT_QUOTES );
    $query = wp_parse_url( $src, PHP_URL_QUERY );
    if ( $query ) {
        parse_str( $query, $q );
        if ( ! empty( $q['pdfemb-data'] ) && is_string( $q['pdfemb-data'] ) ) {
            $b64 = strtr( $q['pdfemb-data'], '-_', '+/' );
            $pad = strlen( $b64 ) % 4;
            if ( $pad ) $b64 .= str_repeat( '=', 4 - $pad );
            $json = json_decode( (string) base64_decode( $b64 ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
            if ( is_array( $json ) && ! empty( $json['url'] ) ) return $json['url'];
        }
        foreach ( array( 'file', 'url', 'src' ) as $k ) {
            if ( ! empty( $q[ $k ] ) && is_string( $q[ $k ] ) && stripos( $q[ $k ], '.pdf' ) !== false ) return $q[ $k ];
        }
    }
    return $src;
}

// ---------------------------------------------------------------------------
// Server-side facade markup (identical structure to the JS fallback).
// Rendered in HTML -> visible before any JS runs, no CLS, page-cache friendly.
// ---------------------------------------------------------------------------
function pdf_lazy_loader_facade_html( $id, $pdf_url, $max_width = '' ) {
    $s    = pdf_lazy_loader_get_settings();
    $t    = pdf_lazy_loader_get_i18n();
    $attr = ' data-pll-target="' . esc_attr( $id ) . '"';
    if ( $s['enableDownload'] && $pdf_url ) {
        $attr .= ' data-pdf-url-enc="' . esc_attr( pdf_lazy_loader_encrypt_url( $pdf_url ) ) . '"';
    }
    $style = $max_width ? ' style="max-width:' . esc_attr( $max_width ) . '"' : '';

    $html  = '<div class="pdf-facade-wrapper pdf-lazy-loader-wrapper"' . $attr . $style . '>';
    $html .= '<div class="pdf-facade-container pdf-lazy-loader-facade"><div class="pdf-facade-content">';
    $html .= '<div class="pdf-facade-icon" aria-hidden="true">PDF</div>';
    $html .= '<div class="pdf-facade-title">' . esc_html( $t['title'] ) . '</div>';
    $html .= '<p class="pdf-facade-subtitle">' . esc_html( $t['subtitle'] ) . '</p>';
    $html .= '<div class="pdf-facade-buttons">';
    $html .= '<button type="button" class="pdf-view-button pdf-lazy-loader-view-btn"><span class="pdf-btn-icon" aria-hidden="true">&#128214;</span>' . esc_html( $t['view'] ) . '</button>';
    if ( $s['enableDownload'] && $pdf_url ) {
        $html .= '<button type="button" class="pdf-download-button pdf-lazy-loader-download-btn"><span class="pdf-btn-icon" aria-hidden="true">&#11015;&#65039;</span>' . esc_html( $t['download'] ) . '</button>';
    }
    $html .= '</div>';
    $html .= '<p class="pdf-facade-info">' . esc_html( $t['info'] ) . '</p>';
    $html .= '</div></div></div>';
    return $html;
}

// ---------------------------------------------------------------------------
// Content filter: strip iframe src (obfuscated copy kept in data attribute),
// hide the iframe with a class and render the facade server-side.
// ---------------------------------------------------------------------------
function pdf_lazy_loader_filter_content( $content, $with_facade = true ) {
    if ( is_admin() || pdf_lazy_loader_is_pdfemb_viewer_request() ) return $content;
    if ( empty( $content ) || stripos( $content, '<iframe' ) === false ) return $content;
    if ( is_feed() ) $with_facade = false;

    $out = preg_replace_callback( '/<iframe\b([^>]*?)>/is', function( $matches ) use ( $with_facade ) {
        $attrs = $matches[1];
        if ( strpos( $attrs, 'data-pdf-lazy-original-src-enc' ) !== false ) return $matches[0];
        if ( ! preg_match( '/\ssrc\s*=\s*(["\'])(.*?)\1/is', $attrs, $m ) ) return $matches[0];
        if ( ! pdf_lazy_loader_is_pdf_url( $m[2] ) ) return $matches[0];

        $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
        $src = html_entity_decode( $m[2], ENT_QUOTES );

        $new_attrs  = ' ' . trim( preg_replace( '/\ssrc\s*=\s*(["\']).*?\1/is', '', $attrs ) );
        $new_attrs .= ' data-pdf-lazy-original-src-enc="' . esc_attr( pdf_lazy_loader_encrypt_url( $src ) ) . '"';

        if ( ! $with_facade ) {
            return '<iframe' . rtrim( $new_attrs ) . ' data-pdf-lazy-intercepted="1">';
        }

        $id = 'pll-' . ( ++$GLOBALS['pdf_lazy_loader_facade_index'] );
        $new_attrs .= ' data-pll-id="' . esc_attr( $id ) . '" aria-hidden="true" tabindex="-1"';
        if ( preg_match( '/\sclass\s*=\s*(["\'])(.*?)\1/is', $new_attrs ) ) {
            $new_attrs = preg_replace( '/(\sclass\s*=\s*(["\']))(.*?)\2/is', '$1$3 pll-iframe-hidden$2', $new_attrs, 1 );
        } else {
            $new_attrs .= ' class="pll-iframe-hidden"';
        }

        $max_width = '';
        if ( preg_match( '/max-width\s*:\s*([0-9.]+(?:px|%|em|rem|vw))/i', $attrs, $mw ) ) {
            $max_width = $mw[1];
        } elseif ( preg_match( '/\swidth\s*=\s*["\']?([0-9]+)(px)?["\'\s]/i', $attrs, $w ) ) {
            $max_width = $w[1] . 'px';
        }

        return pdf_lazy_loader_facade_html( $id, pdf_lazy_loader_resolve_pdf_url( $src ), $max_width )
             . '<iframe' . rtrim( $new_attrs ) . '>';
    }, $content );

    // PDF found only after wp_enqueue_scripts (e.g. in a widget): enqueue our
    // assets late so they are printed in the footer.
    if ( $with_facade && $out !== $content && did_action( 'wp_enqueue_scripts' )
         && ! wp_script_is( 'pdf-lazy-loader', 'enqueued' ) ) {
        pdf_lazy_loader_enqueue_frontend_scripts();
    }
    return $out;
}

// REST: obfuscate iframe src for every public post type (no facade markup —
// REST consumers do not run our JS).
function pdf_lazy_loader_register_rest_filters() {
    foreach ( get_post_types( array( 'public' => true, 'show_in_rest' => true ) ) as $pt ) {
        add_filter( "rest_prepare_{$pt}", 'pdf_lazy_loader_filter_rest_content', 999, 3 );
    }
}

function pdf_lazy_loader_filter_rest_content( $response, $post, $request ) {
    if ( is_wp_error( $response ) ) return $response;
    if ( isset( $response->data['content']['rendered'] ) ) {
        $response->data['content']['rendered'] = pdf_lazy_loader_filter_content( $response->data['content']['rendered'], false );
    }
    return $response;
}

// ---------------------------------------------------------------------------
// Page-level PDF detection — tri-state memoized, scans every post of the main
// query (archives / blog index included).
// ---------------------------------------------------------------------------
function pdf_lazy_loader_content_has_pdf( $c ) {
    if ( $c === '' ) return false;
    if ( strpos( $c, '[pdf-embedder' ) !== false || strpos( $c, '[pdfemb' ) !== false || strpos( $c, 'pdf-embedder' ) !== false ) return true;
    if ( strpos( $c, 'data-pdf-lazy-original-src-enc' ) !== false ) return true;
    if ( stripos( $c, '<iframe' ) !== false &&
         preg_match_all( '/<iframe[^>]*(?:src|data-src)\s*=\s*["\']([^"\']*?)["\']/is', $c, $m ) ) {
        foreach ( $m[1] as $src ) {
            if ( pdf_lazy_loader_is_pdf_url( $src ) ) return true;
        }
    }
    return false;
}

// PDF Embedder Premium renders its viewer as the front page with
// ?pdfemb-data=... (inside the iframe). The plugin must never touch that
// request, otherwise the viewer's own pdf-viewer.min.js / CSS are stripped.
function pdf_lazy_loader_is_pdfemb_viewer_request() {
    return isset( $_GET['pdfemb-data'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
}

function pdf_lazy_loader_has_pdf_iframes() {
    static $detected = null;
    if ( is_admin() || pdf_lazy_loader_is_pdfemb_viewer_request() ) return false;
    if ( ! empty( $GLOBALS['pdf_lazy_loader_has_pdfs'] ) ) return true;
    if ( $detected !== null ) return $detected;
    if ( ! did_action( 'wp' ) ) return false; // main query not ready yet — do not cache

    $detected = false;
    if ( is_singular() || is_home() || is_archive() || is_search() ) {
        global $wp_query;
        $posts = ( $wp_query && ! empty( $wp_query->posts ) ) ? $wp_query->posts : array();
        foreach ( $posts as $p ) {
            if ( $p instanceof WP_Post && pdf_lazy_loader_content_has_pdf( (string) $p->post_content ) ) {
                $detected = true;
                break;
            }
        }
    }
    $detected = (bool) apply_filters( 'pdf_lazy_loader_has_pdf', $detected );
    if ( $detected ) $GLOBALS['pdf_lazy_loader_has_pdfs'] = true;
    return $detected;
}

// ---------------------------------------------------------------------------
// Inline head script (early iframe interceptor for iframes that do NOT pass
// through the_content, e.g. page builders / dynamically injected markup)
// ---------------------------------------------------------------------------
function pdf_lazy_loader_add_inline_script() {
    if ( is_admin() || ! pdf_lazy_loader_has_pdf_iframes() ) return;
    $js = "(function(){'use strict';var K='pdf-lazy-loader-secure-key-2024',I=['.pdf','application/pdf','pdf-embedder','pdfembed','pdfemb-data','pdfjs','viewer.html'];"
        . "function x(s){var o='';for(var i=0;i<s.length;i++)o+=String.fromCharCode(s.charCodeAt(i)^K.charCodeAt(i%K.length));try{return btoa(o);}catch(e){return '';}}"
        . "function c(f){var s=f.getAttribute('src')||'';if(!s||f.hasAttribute('data-pdf-lazy-original-src-enc'))return;var l=s.toLowerCase();for(var j=0;j<I.length;j++){if(l.indexOf(I[j])!==-1){var e=x(s);if(!e)return;f.setAttribute('data-pdf-lazy-original-src-enc',e);f.removeAttribute('src');f.setAttribute('data-pdf-lazy-intercepted','1');return;}}}"
        . "function a(){var e=document.getElementsByTagName('iframe');for(var i=0;i<e.length;i++)c(e[i]);}"
        . "a();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',a,{once:true});"
        . "if(window.MutationObserver){new MutationObserver(function(ms){for(var m=0;m<ms.length;m++){var n=ms[m].addedNodes;for(var k=0;k<n.length;k++){var d=n[k];if(d.nodeType!==1)continue;if(d.tagName==='IFRAME')c(d);else if(d.getElementsByTagName){var f=d.getElementsByTagName('iframe');for(var q=0;q<f.length;q++)c(f[q]);}}}}).observe(document.documentElement,{childList:true,subtree:true});}"
        . "})();";
    echo pdf_lazy_loader_inline_script_tag( $js, array( 'id' => 'pdf-lazy-loader-early' ) ); // phpcs:ignore WordPress.Security.EscapeOutput
}

// ---------------------------------------------------------------------------
// Frontend enqueue (wp_enqueue_scripts:1000, right after Layer 1)
// ---------------------------------------------------------------------------
function pdf_lazy_loader_enqueue_frontend_scripts() {
    if ( is_admin() || ! pdf_lazy_loader_has_pdf_iframes() ) return;

    $settings = pdf_lazy_loader_get_settings();
    $assets   = $GLOBALS['pdf_lazy_loader_pdfemb_assets'];
    foreach ( $assets['js'] as $i => $a ) unset( $assets['js'][ $i ]['before'] ); // printed separately

    $data = array_merge( $settings, array(
        'version'      => PDF_LAZY_LOADER_VERSION,
        'pdfembAssets' => $assets,
        'i18n'         => pdf_lazy_loader_get_i18n(),
    ) );

    wp_enqueue_style( 'pdf-lazy-loader', PDF_LAZY_LOADER_PLUGIN_URL . 'assets/css/pdf-lazy-loader.css', array(), PDF_LAZY_LOADER_VERSION );

    // Colors and responsive facade heights as CSS custom properties —
    // no inline style recalculation / resize listeners in JS.
    $color = sanitize_hex_color( $settings['buttonColor'] )      ?: '#FF6B6B';
    $hover = sanitize_hex_color( $settings['buttonColorHover'] ) ?: '#E63946';
    wp_add_inline_style( 'pdf-lazy-loader', sprintf(
        ':root{--pll-btn:%s;--pll-btn-hover:%s;--pll-h-desktop:%dpx;--pll-h-tablet:%dpx;--pll-h-mobile:%dpx}',
        $color, $hover,
        max( 200, $settings['facadeHeightDesktop'] ),
        max( 200, $settings['facadeHeightTablet'] ),
        max( 200, $settings['facadeHeightMobile'] )
    ) );

    wp_enqueue_script(
        'pdf-lazy-loader',
        PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/pdf-lazy-loader.js',
        array(),
        PDF_LAZY_LOADER_VERSION,
        array( 'in_footer' => true, 'strategy' => 'defer' )
    );
    wp_add_inline_script( 'pdf-lazy-loader', 'var pdfLazyLoaderData = ' . wp_json_encode( $data ) . ';', 'before' );
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------
function pdf_lazy_loader_settings_page() {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( esc_html__( 'You do not have sufficient permissions to access this page.', 'pdf-lazy-loader' ) );
    }
    $settings = pdf_lazy_loader_get_settings();
    ?>
    <div class="wrap pdf-lazy-loader-settings">
        <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
        <?php settings_errors( 'pdf_lazy_loader_settings' ); ?>
        <form method="post" action="options.php">
            <?php settings_fields( 'pdf_lazy_loader_settings' ); ?>

            <div class="pll-section">
                <div class="pll-section__header"><span class="pll-section__icon">🎨</span><h2 class="pll-section__title">Button &amp; Appearance</h2></div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_button_color">Button Color</label></th>
                        <td>
                            <div class="pll-color-row">
                                <input type="color" id="pdf_lazy_loader_button_color" name="pdf_lazy_loader_button_color" value="<?php echo esc_attr( $settings['buttonColor'] ); ?>" />
                                <code class="pll-color-value" id="pll-color-val-main"><?php echo esc_html( $settings['buttonColor'] ); ?></code>
                            </div>
                            <span class="description">Color of the "View PDF" button</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_button_color_hover">Button Hover Color</label></th>
                        <td>
                            <div class="pll-color-row">
                                <input type="color" id="pdf_lazy_loader_button_color_hover" name="pdf_lazy_loader_button_color_hover" value="<?php echo esc_attr( $settings['buttonColorHover'] ); ?>" />
                                <code class="pll-color-value" id="pll-color-val-hover"><?php echo esc_html( $settings['buttonColorHover'] ); ?></code>
                            </div>
                            <span class="description">Color on mouse hover</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_loading_time">Minimum Loading Time (ms)</label></th>
                        <td>
                            <input type="number" id="pdf_lazy_loader_loading_time" name="pdf_lazy_loader_loading_time" value="<?php echo esc_attr( $settings['loadingTime'] ); ?>" min="0" max="5000" step="50" class="pll-input-sm" />
                            <span class="description">Minimum spinner duration (0–5000 ms). Runs in parallel with viewer asset loading, so it only adds time when assets load faster than this value. Recommended: 300.</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_enable_download">Show Download Button</label></th>
                        <td>
                            <input type="hidden" name="pdf_lazy_loader_enable_download" value="0" />
                            <label class="pll-toggle">
                                <input type="checkbox" id="pdf_lazy_loader_enable_download" name="pdf_lazy_loader_enable_download" value="1" <?php checked( $settings['enableDownload'], true ); ?> />
                                <span class="pll-toggle__slider"></span>
                            </label>
                            <span class="description">Show a Download button alongside View PDF</span>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="pll-section">
                <div class="pll-section__header"><span class="pll-section__icon">📐</span><h2 class="pll-section__title">Facade Heights</h2></div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_facade_height_desktop">Desktop <span class="pll-badge">≥ 1024px</span></label></th>
                        <td><div class="pll-input-row"><input type="number" id="pdf_lazy_loader_facade_height_desktop" name="pdf_lazy_loader_facade_height_desktop" value="<?php echo esc_attr( $settings['facadeHeightDesktop'] ); ?>" min="200" max="2000" step="10" class="pll-input-sm" /><span class="pll-unit">px</span></div></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_facade_height_tablet">Tablet <span class="pll-badge">768–1023px</span></label></th>
                        <td><div class="pll-input-row"><input type="number" id="pdf_lazy_loader_facade_height_tablet" name="pdf_lazy_loader_facade_height_tablet" value="<?php echo esc_attr( $settings['facadeHeightTablet'] ); ?>" min="200" max="1500" step="10" class="pll-input-sm" /><span class="pll-unit">px</span></div></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_facade_height_mobile">Mobile <span class="pll-badge">&lt; 768px</span></label></th>
                        <td><div class="pll-input-row"><input type="number" id="pdf_lazy_loader_facade_height_mobile" name="pdf_lazy_loader_facade_height_mobile" value="<?php echo esc_attr( $settings['facadeHeightMobile'] ); ?>" min="200" max="1000" step="10" class="pll-input-sm" /><span class="pll-unit">px</span></div></td>
                    </tr>
                </table>
            </div>

            <div class="pll-section">
                <div class="pll-section__header"><span class="pll-section__icon">🛡️</span><h2 class="pll-section__title">Cloudflare Turnstile Protection</h2></div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_enable_turnstile">Enable Turnstile</label></th>
                        <td>
                            <input type="hidden" name="pdf_lazy_loader_enable_turnstile" value="0" />
                            <label class="pll-toggle">
                                <input type="checkbox" id="pdf_lazy_loader_enable_turnstile" name="pdf_lazy_loader_enable_turnstile" value="1" <?php checked( $settings['enableTurnstile'], true ); ?> />
                                <span class="pll-toggle__slider"></span>
                            </label>
                            <span class="description">Require Cloudflare Turnstile verification before viewing or downloading PDF</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_turnstile_site_key">Site Key</label></th>
                        <td>
                            <input type="text" id="pdf_lazy_loader_turnstile_site_key" name="pdf_lazy_loader_turnstile_site_key" value="<?php echo esc_attr( $settings['turnstileSiteKey'] ); ?>" class="regular-text" placeholder="1x00000000000000000000AA" />
                            <span class="description">Your Cloudflare Turnstile Site Key (<a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noopener">get it here</a>)</span>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_turnstile_secret_key">Secret Key</label></th>
                        <td>
                            <input type="password" id="pdf_lazy_loader_turnstile_secret_key" name="pdf_lazy_loader_turnstile_secret_key" value="<?php echo esc_attr( get_option( 'pdf_lazy_loader_turnstile_secret_key', '' ) ); ?>" class="regular-text" placeholder="1x0000000000000000000000000000000AA" />
                            <span class="description">Your Cloudflare Turnstile Secret Key (stored securely)</span>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="pll-section">
                <div class="pll-section__header"><span class="pll-section__icon">🐞</span><h2 class="pll-section__title">Debug Settings</h2></div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_debug_mode">Enable Debug Mode</label></th>
                        <td>
                            <input type="hidden" name="pdf_lazy_loader_debug_mode" value="0" />
                            <label class="pll-toggle">
                                <input type="checkbox" id="pdf_lazy_loader_debug_mode" name="pdf_lazy_loader_debug_mode" value="1" <?php checked( $settings['debugMode'], true ); ?> />
                                <span class="pll-toggle__slider"></span>
                            </label>
                            <span class="description">Outputs detailed logs to the browser console. <strong>Disable in production.</strong></span>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="pll-footer">
                <?php submit_button( 'Save Changes', 'primary', 'submit', false ); ?>
                <span class="pll-version">PDF Lazy Loader v<?php echo esc_html( PDF_LAZY_LOADER_VERSION ); ?></span>
            </div>
        </form>

        <div class="pll-info-card">
            <div class="pll-info-card__header"><span class="pll-section__icon">👁️</span><h2 class="pll-section__title">Live Preview</h2></div>
            <p class="pll-info-card__desc">Facade appearance with current button color settings:</p>
            <div id="pdf-lazy-loader-preview"></div>
        </div>
    </div>
    <?php
}

// ---------------------------------------------------------------------------
// Activation / Uninstall
// ---------------------------------------------------------------------------
register_activation_hook( __FILE__, 'pdf_lazy_loader_activation' );
function pdf_lazy_loader_activation() {
    $defaults = array(
        'pdf_lazy_loader_button_color'       => '#FF6B6B',
        'pdf_lazy_loader_button_color_hover' => '#E63946',
        'pdf_lazy_loader_loading_time'       => PDF_LAZY_LOADER_DEFAULT_WAIT,
    );
    foreach ( $defaults as $key => $value ) {
        if ( get_option( $key ) === false ) update_option( $key, $value );
    }
    pdf_lazy_loader_maybe_upgrade();
}

register_uninstall_hook( __FILE__, 'pdf_lazy_loader_uninstall' );
function pdf_lazy_loader_uninstall() {
    $options = array(
        'pdf_lazy_loader_button_color', 'pdf_lazy_loader_button_color_hover',
        'pdf_lazy_loader_loading_time', 'pdf_lazy_loader_enable_download',
        'pdf_lazy_loader_facade_height_desktop', 'pdf_lazy_loader_facade_height_tablet',
        'pdf_lazy_loader_facade_height_mobile', 'pdf_lazy_loader_enable_turnstile',
        'pdf_lazy_loader_turnstile_site_key', 'pdf_lazy_loader_turnstile_secret_key',
        'pdf_lazy_loader_debug_mode', 'pdf_lazy_loader_db_version',
    );
    foreach ( $options as $o ) delete_option( $o );
}
