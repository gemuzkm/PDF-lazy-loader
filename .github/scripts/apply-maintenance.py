from pathlib import Path
import hashlib
import re
import json
import struct
import gettext
import io


def load(path, expected):
    b = Path(path).read_bytes()
    actual = hashlib.sha1(b'blob %d\0' % len(b) + b).hexdigest()
    if actual != expected:
        raise RuntimeError('Source changed: ' + path)
    return b.decode('utf-8')


def replace(s, old, new):
    if s.count(old) != 1:
        raise RuntimeError('Expected one anchor: ' + old[:100])
    return s.replace(old, new, 1)


php = load('pdf-lazy-loader.php', '84d84186c91c88633139aaff370fc4803c97f9c4')
js = load('assets/js/pdf-lazy-loader.js', 'c642e171da720f3ad909b39b64b5cfa278c5bf39')
admin = load('assets/js/admin.js', 'aaa83a411c67598d896fc6a7b744eb771e956ffe')
readme = load('README.md', 'd2680cc66fb27f7e170ed7730aa3251cc5ef1f35')
for path, sha in {
    '.github/workflows/build-assets.yml': '38a5195a947848bcde1308a59b93710dcf89affb',
    '.github/workflows/ci.yml': '75a17992ee9806260f35e2f5e3ec493213d199d0',
    '.github/workflows/release.yml': '1de4f11ecdbaf395d411b63916533c38170b7ad2',
}.items():
    load(path, sha)
for path, sha in {
    '.github/scripts/apply-asset-retry.py': '9565f87f46e0741388573a644c4aeb3665332013',
    '.github/scripts/apply-blob-download.py': '9e4bfe5d6e4d7f5b7f0628640cf8a1bcd2c8b213',
}.items():
    load(path, sha)
php = replace(php, ' * Version: 1.3.7', ' * Version: 1.3.8')
php = replace(php, "define( 'PDF_LAZY_LOADER_VERSION',      '1.3.7' );", "define( 'PDF_LAZY_LOADER_VERSION',      '1.3.8' );")
php = replace(php, "add_action( 'plugins_loaded',        'pdf_lazy_loader_maybe_upgrade' );", "add_action( 'plugins_loaded',        'pdf_lazy_loader_maybe_upgrade' );\nadd_action( 'init', 'pdf_lazy_loader_load_textdomain' );")
anchor = 'function pdf_lazy_loader_maybe_upgrade() {'
php = replace(php, anchor, "function pdf_lazy_loader_load_textdomain() {\n    load_plugin_textdomain( 'pdf-lazy-loader', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );\n}\n\n" + anchor)
php = replace(php, "PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/admin.js',  array( 'jquery' ),", "PDF_LAZY_LOADER_PLUGIN_URL . 'assets/js/admin.js',  array(),")
php = replace(php, "        'retry'        => __( 'Try again', 'pdf-lazy-loader' ),", "        // translators: %1$s: adjusted button color; %2$s: adjusted hover color.\n        'previewContrast' => __( 'Colors are darkened for WCAG AA contrast with white text: button %1$s, hover %2$s.', 'pdf-lazy-loader' ),\n        'retry'        => __( 'Try again', 'pdf-lazy-loader' ),")
start = php.index('function pdf_lazy_loader_settings_page() {')
end = php.index('register_activation_hook( __FILE__', start)
settings = r'''function pdf_lazy_loader_admin_field( $id, $label, $type, $value, $description = '', $args = array() ) {
    echo '<tr><th scope="row"><label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label></th><td>';
    if ( $type === 'checkbox' ) {
        echo '<input type="hidden" name="' . esc_attr( $id ) . '" value="0" />';
        echo '<label class="pll-toggle"><input type="checkbox" id="' . esc_attr( $id ) . '" name="' . esc_attr( $id ) . '" value="1" ' . checked( $value, true, false ) . ' /><span class="pll-toggle__slider"></span></label>';
    } else {
        $class = $type === 'number' ? 'pll-input-sm' : ( $type === 'color' ? '' : 'regular-text' );
        echo '<input type="' . esc_attr( $type ) . '" id="' . esc_attr( $id ) . '" name="' . esc_attr( $id ) . '" value="' . esc_attr( $value ) . '" class="' . esc_attr( $class ) . '"';
        foreach ( array( 'min', 'max', 'step', 'placeholder', 'autocomplete' ) as $attribute ) {
            if ( isset( $args[ $attribute ] ) ) echo ' ' . esc_attr( $attribute ) . '="' . esc_attr( $args[ $attribute ] ) . '"';
        }
        echo ' />';
        if ( $type === 'color' ) {
            $code_id = $id === 'pdf_lazy_loader_button_color' ? 'pll-color-val-main' : 'pll-color-val-hover';
            echo ' <code class="pll-color-value" id="' . esc_attr( $code_id ) . '">' . esc_html( $value ) . '</code>';
        }
    }
    if ( $description !== '' ) echo '<span class="description">' . esc_html( $description ) . '</span>';
    echo '</td></tr>';
}

function pdf_lazy_loader_settings_page() {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( esc_html__( 'You do not have sufficient permissions to access this page.', 'pdf-lazy-loader' ) );
    $s = pdf_lazy_loader_get_settings();
    $prefix = 'pdf_lazy_loader_';
    $secret_saved = (string) get_option( 'pdf_lazy_loader_turnstile_secret_key', '' ) !== '';
    $groups = array(
        array( __( 'Appearance', 'pdf-lazy-loader' ), array(
            array( 'button_color', __( 'Button Color', 'pdf-lazy-loader' ), 'color', $s['buttonColor'], __( 'Button and PDF icon color. A darker shade is used when required for contrast with white text.', 'pdf-lazy-loader' ) ),
            array( 'button_color_hover', __( 'Button Hover Color', 'pdf-lazy-loader' ), 'color', $s['buttonColorHover'], __( 'Button color on hover and keyboard focus.', 'pdf-lazy-loader' ) ),
            array( 'loading_time', __( 'Minimum Loading Time (ms)', 'pdf-lazy-loader' ), 'number', $s['loadingTime'], __( 'Minimum spinner duration (0–5000 ms), in parallel with asset loading. Default: 300 ms.', 'pdf-lazy-loader' ), array( 'min' => 0, 'max' => 5000, 'step' => 50 ) ),
        ) ),
        array( __( 'Downloads', 'pdf-lazy-loader' ), array(
            array( 'enable_download', __( 'Show Download Button', 'pdf-lazy-loader' ), 'checkbox', $s['enableDownload'], __( 'Show a Download button alongside View PDF.', 'pdf-lazy-loader' ) ),
            array( 'blob_download', __( 'Download via Blob', 'pdf-lazy-loader' ), 'checkbox', $s['blobDownload'], __( 'Applies only to the facade Download button. The complete PDF is fetched before saving. External files require CORS. The original request remains visible in developer tools; there is no direct-link fallback on failure.', 'pdf-lazy-loader' ) ),
        ) ),
        array( __( 'Facade Heights', 'pdf-lazy-loader' ), array(
            array( 'facade_height_desktop', __( 'Desktop (≥ 1024 px)', 'pdf-lazy-loader' ), 'number', $s['facadeHeightDesktop'], __( 'Height in pixels.', 'pdf-lazy-loader' ), array( 'min' => 200, 'max' => 2000, 'step' => 10 ) ),
            array( 'facade_height_tablet', __( 'Tablet (768–1023 px)', 'pdf-lazy-loader' ), 'number', $s['facadeHeightTablet'], __( 'Height in pixels.', 'pdf-lazy-loader' ), array( 'min' => 200, 'max' => 1500, 'step' => 10 ) ),
            array( 'facade_height_mobile', __( 'Mobile (< 768 px)', 'pdf-lazy-loader' ), 'number', $s['facadeHeightMobile'], __( 'Height in pixels.', 'pdf-lazy-loader' ), array( 'min' => 200, 'max' => 1000, 'step' => 10 ) ),
        ) ),
        array( __( 'Cloudflare Turnstile', 'pdf-lazy-loader' ), array(
            array( 'enable_turnstile', __( 'Enable Turnstile', 'pdf-lazy-loader' ), 'checkbox', $s['enableTurnstile'], __( 'Require verification before viewing or downloading a PDF.', 'pdf-lazy-loader' ) ),
            array( 'turnstile_site_key', __( 'Site Key', 'pdf-lazy-loader' ), 'text', $s['turnstileSiteKey'], __( 'The site key from your Cloudflare Turnstile widget.', 'pdf-lazy-loader' ) ),
            array( 'turnstile_secret_key', __( 'Secret Key', 'pdf-lazy-loader' ), 'password', '', __( 'Used only by server-side verification. Leave empty to keep the saved key.', 'pdf-lazy-loader' ), array( 'autocomplete' => 'new-password', 'placeholder' => $secret_saved ? __( 'Key saved', 'pdf-lazy-loader' ) : '' ) ),
            array( 'server_verify', __( 'Server-side verification', 'pdf-lazy-loader' ), 'checkbox', (bool) get_option( 'pdf_lazy_loader_server_verify', false ), __( 'Validate the token on the server before releasing PDF URLs. Requires site and secret keys and OpenSSL (AES-256-GCM). One verification request per post with PDFs; allow the verify REST route in your firewall.', 'pdf-lazy-loader' ) ),
        ) ),
        array( __( 'Diagnostics', 'pdf-lazy-loader' ), array(
            array( 'debug_mode', __( 'Enable Debug Mode', 'pdf-lazy-loader' ), 'checkbox', $s['debugMode'], __( 'Write diagnostic messages to the browser console. Disable in production.', 'pdf-lazy-loader' ) ),
        ) ),
    );
    echo '<div class="wrap pdf-lazy-loader-settings"><h1>' . esc_html( get_admin_page_title() ) . '</h1>';
    settings_errors( 'pdf_lazy_loader_settings' );
    echo '<form method="post" action="options.php">';
    settings_fields( 'pdf_lazy_loader_settings' );
    foreach ( $groups as $group ) {
        echo '<div class="pll-section"><div class="pll-section__header"><h2 class="pll-section__title">' . esc_html( $group[0] ) . '</h2></div><table class="form-table pll-table">';
        foreach ( $group[1] as $field ) {
            pdf_lazy_loader_admin_field( $prefix . $field[0], $field[1], $field[2], $field[3], $field[4], isset( $field[5] ) ? $field[5] : array() );
        }
        echo '</table></div>';
    }
    if ( get_option( 'pdf_lazy_loader_server_verify', false ) ) {
        if ( pdf_lazy_loader_server_verify_active() ) {
            echo '<p class="description">' . esc_html__( 'Server-side verification is active.', 'pdf-lazy-loader' ) . ' <code>' . esc_html( rest_url( 'pdf-lazy-loader/v1/verify' ) ) . '</code></p>';
        } else {
            echo '<p class="description" role="status">' . esc_html__( 'Server-side verification is not active. Check Turnstile keys and OpenSSL support. Client-side verification is used instead.', 'pdf-lazy-loader' ) . '</p>';
        }
    }
    echo '<p><a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noopener">' . esc_html__( 'Manage Cloudflare Turnstile widgets', 'pdf-lazy-loader' ) . '</a></p>';
    echo '<div class="pll-footer">';
    submit_button( __( 'Save Changes', 'pdf-lazy-loader' ), 'primary', 'submit', false );
    echo '<span class="pll-version">PDF Lazy Loader v' . esc_html( PDF_LAZY_LOADER_VERSION ) . '</span></div></form>';
    echo '<div class="pll-info-card"><div class="pll-info-card__header"><h2 class="pll-section__title">' . esc_html__( 'Live Preview', 'pdf-lazy-loader' ) . '</h2></div><p class="pll-info-card__desc">' . esc_html__( 'The facade with the current colors, heights and Download setting.', 'pdf-lazy-loader' ) . '</p><div id="pdf-lazy-loader-preview"></div></div></div>';
}

'''
php = php[:start] + settings + php[end:]
js = replace(js, "raw.version || '1.3.7'", "raw.version || '1.3.8'")
old = """            html += '<p class="description pll-preview-note">Colors are darkened for WCAG AA contrast with white text: button ' +
                esc(colors.btn) + ', hover ' + esc(colors.hover) + '.</p>';"""
new = """            var note = i18n.previewContrast || 'Colors are darkened for WCAG AA contrast with white text: button %1$s, hover %2$s.';
            note = note.replace('%1$s', colors.btn).replace('%2$s', colors.hover);
            html += '<p class="description pll-preview-note">' + esc(note) + '</p>';"""
admin = replace(admin, old, new)
old = '- PDF Embedder Premium (Legacy) 5.3.x with the free PDF Embedder plugin active'
new = '- Reference implementation reviewed: PDF Embedder Premium (Legacy) 5.3.2, with the free PDF Embedder plugin active (Premium declares Lite 4.9.3 or later). This is a code-reviewed compatibility target, not a claim that every Lite/Premium combination has been tested.\n- The supported Premium stack requires WordPress 6.1 or later (Premium 5.3.2 requirement), even though PDF Lazy Loader alone declares WordPress 5.7+.\n- The facade targets Premium iframe output using the front-page `?pdfemb-data=` viewer route. Free PDF Embedder without Premium uses a different renderer and does not get the click-to-load facade. Other Premium versions, Secure/Pro editions and modified distributions require separate compatibility testing.'
readme = replace(readme, old, new)
readme = replace(readme, '## For developers\n', '## Translations\n\nSettings, the preview and facade messages use the `pdf-lazy-loader` text domain. English is the source language; Russian (`ru_RU`) is bundled as PO/MO catalogs. WordPress selects translations using the current locale (including the administrator user language). The POT template is in `languages/pdf-lazy-loader.pot`.\n\n## For developers\n')
readme = replace(readme, '### v1.3.7\n', '### v1.3.8\n- Localized all settings labels, help text, status messages and the preview contrast note; added POT and Russian PO/MO catalogs\n- Removed the unused admin.js jQuery dependency\n- Clarified the code-reviewed Premium Legacy 5.3.2 compatibility target and its requirements\n- Removed obsolete patch scripts and temporary maintenance automation; retained the three standard workflows\n\n### v1.3.7\n')
ru = {
    "PDF Lazy Loader Settings": "Настройки PDF Lazy Loader",
    "PDF Document": "Документ PDF",
    "Click the button below to load the document": "Нажмите кнопку ниже, чтобы загрузить документ",
    "View PDF": "Открыть PDF",
    "Download": "Скачать",
    "Document will be loaded on first access": "Документ загрузится при первом обращении",
    "Loading PDF...": "Загрузка PDF…",
    "Please complete verification to continue": "Пройдите проверку, чтобы продолжить",
    "Verification failed.": "Проверка не пройдена.",
    "Verification expired.": "Срок действия проверки истёк.",
    "Verification error. Refresh the page.": "Ошибка проверки. Обновите страницу.",
    "Failed to load verification.": "Не удалось загрузить проверку.",
    "Verification could not be completed. Please try again.": "Не удалось выполнить проверку. Повторите попытку.",
    "This page is outdated. Please reload it.": "Эта страница устарела. Обновите её.",
    "Try again": "Повторить попытку",
    "Preparing download...": "Подготовка скачивания…",
    "Download failed. Please try again. External files must allow CORS.": "Не удалось скачать файл. Повторите попытку. Для внешних файлов требуется разрешение CORS.",
    "Viewer files could not be loaded. Click View PDF to try again.": "Не удалось загрузить файлы просмотрщика. Нажмите «Открыть PDF», чтобы повторить попытку.",
    "You do not have sufficient permissions to access this page.": "У вас недостаточно прав для доступа к этой странице.",
    "Appearance": "Оформление",
    "Button Color": "Цвет кнопки",
    "Button and PDF icon color. A darker shade is used when required for contrast with white text.": "Цвет кнопки и значка PDF. При необходимости используется более тёмный оттенок для контраста с белым текстом.",
    "Button Hover Color": "Цвет кнопки при наведении",
    "Button color on hover and keyboard focus.": "Цвет кнопки при наведении и фокусе с клавиатуры.",
    "Minimum Loading Time (ms)": "Минимальное время загрузки (мс)",
    "Minimum spinner duration (0–5000 ms), in parallel with asset loading. Default: 300 ms.": "Минимальное время показа индикатора (0–5000 мс), параллельно загрузке файлов. По умолчанию: 300 мс.",
    "Downloads": "Скачивание",
    "Show Download Button": "Показывать кнопку скачивания",
    "Show a Download button alongside View PDF.": "Показывать кнопку «Скачать» рядом с кнопкой «Открыть PDF».",
    "Download via Blob": "Скачивание через Blob",
    "Applies only to the facade Download button. The complete PDF is fetched before saving. External files require CORS. The original request remains visible in developer tools; there is no direct-link fallback on failure.": "Применяется только к кнопке скачивания заглушки. Перед сохранением PDF загружается полностью. Для внешних файлов требуется CORS. Исходный запрос виден в инструментах разработчика; при ошибке перехода по прямой ссылке не будет.",
    "Facade Heights": "Высота заглушки",
    "Desktop (≥ 1024 px)": "Компьютер (≥ 1024 px)",
    "Tablet (768–1023 px)": "Планшет (768–1023 px)",
    "Mobile (< 768 px)": "Телефон (< 768 px)",
    "Height in pixels.": "Высота в пикселях.",
    "Cloudflare Turnstile": "Cloudflare Turnstile",
    "Enable Turnstile": "Включить Turnstile",
    "Require verification before viewing or downloading a PDF.": "Требовать проверку перед просмотром или скачиванием PDF.",
    "Site Key": "Ключ сайта",
    "The site key from your Cloudflare Turnstile widget.": "Ключ сайта из вашего виджета Cloudflare Turnstile.",
    "Secret Key": "Секретный ключ",
    "Used only by server-side verification. Leave empty to keep the saved key.": "Используется только для серверной проверки. Оставьте поле пустым, чтобы сохранить прежний ключ.",
    "Key saved": "Ключ сохранён",
    "Server-side verification": "Серверная проверка",
    "Validate the token on the server before releasing PDF URLs. Requires site and secret keys and OpenSSL (AES-256-GCM). One verification request per post with PDFs; allow the verify REST route in your firewall.": "Проверять токен на сервере перед выдачей адресов PDF. Нужны ключ сайта, секретный ключ и OpenSSL (AES-256-GCM). Один запрос проверки на запись с PDF; разрешите REST-маршрут проверки в межсетевом экране.",
    "Diagnostics": "Диагностика",
    "Enable Debug Mode": "Включить режим отладки",
    "Write diagnostic messages to the browser console. Disable in production.": "Выводить диагностические сообщения в консоль браузера. Отключите на рабочем сайте.",
    "Server-side verification is active.": "Серверная проверка активна.",
    "Server-side verification is not active. Check Turnstile keys and OpenSSL support. Client-side verification is used instead.": "Серверная проверка неактивна. Проверьте ключи Turnstile и поддержку OpenSSL. Используется клиентская проверка.",
    "Manage Cloudflare Turnstile widgets": "Управление виджетами Cloudflare Turnstile",
    "Save Changes": "Сохранить изменения",
    "Live Preview": "Предпросмотр",
    "The facade with the current colors, heights and Download setting.": "Заглушка с текущими цветами, высотой и настройкой скачивания.",
    "Colors are darkened for WCAG AA contrast with white text: button %1$s, hover %2$s.": "Цвета затемнены для контраста с белым текстом по WCAG AA: кнопка %1$s, при наведении %2$s."
}

pattern = r"(?:__|_e|esc_html__|esc_html_e|esc_attr__|esc_attr_e)\(\s*'((?:\\.|[^'\\])*)'\s*,\s*'pdf-lazy-loader'"
messages = set(re.findall(pattern, php))
missing = sorted(messages - set(ru))
if missing:
    raise RuntimeError('Missing Russian translations: ' + repr(missing))
header = 'Project-Id-Version: PDF Lazy Loader 1.3.8\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n'
ru_header = header + 'Language: ru_RU\nPlural-Forms: nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);\n'


def catalog(translations, metadata):
    result = '# PDF Lazy Loader translations.\nmsgid ""\nmsgstr ' + json.dumps(metadata, ensure_ascii=False) + '\n\n'
    for key in sorted(messages):
        result += 'msgid ' + json.dumps(key, ensure_ascii=False) + '\nmsgstr ' + json.dumps(translations.get(key, ''), ensure_ascii=False) + '\n\n'
    return result


def mo(catalog):
    entries = sorted((k.encode('utf-8'), v.encode('utf-8')) for k, v in catalog.items())
    count = len(entries)
    offset = 28 + count * 16
    originals = b''.join(k + b'\0' for k, v in entries)
    translated = b''.join(v + b'\0' for k, v in entries)
    first, second = [], []
    off = offset
    for k, v in entries:
        first.append((len(k), off))
        off += len(k) + 1
    off = offset + len(originals)
    for k, v in entries:
        second.append((len(v), off))
        off += len(v) + 1
    return struct.pack('<7I', 0x950412de, 0, count, 28, 28 + count * 8, 0, 0) + b''.join(struct.pack('<2I', *x) for x in first + second) + originals + translated


translations = {key: ru[key] for key in messages}
translations[''] = ru_header
binary = mo(translations)
check = gettext.GNUTranslations(io.BytesIO(binary))
for key in messages:
    assert check.gettext(key) == ru[key]
    assert sorted(re.findall(r'%\d+\$s', key)) == sorted(re.findall(r'%\d+\$s', ru[key]))
Path('languages').mkdir(exist_ok=True)
for path, content in [('pdf-lazy-loader.php', php), ('assets/js/pdf-lazy-loader.js', js), ('assets/js/admin.js', admin), ('README.md', readme), ('languages/pdf-lazy-loader.pot', catalog({}, header)), ('languages/pdf-lazy-loader-ru_RU.po', catalog(ru, ru_header))]:
    Path(path).write_text(content, encoding='utf-8')
Path('languages/pdf-lazy-loader-ru_RU.mo').write_bytes(binary)
