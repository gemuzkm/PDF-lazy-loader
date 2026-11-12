from pathlib import Path
import hashlib


def replace(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('Expected one patch anchor: ' + old[:100])
    return text.replace(old, new, 1)


def load(path, expected):
    data = Path(path).read_bytes()
    actual = hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()
    if actual != expected:
        raise RuntimeError('Source changed: ' + path + ' (' + actual + ')')
    return data.decode('utf-8')


php_path = 'pdf-lazy-loader.php'
js_path = 'assets/js/pdf-lazy-loader.js'
readme_path = 'README.md'
if "'pdf_lazy_loader_blob_download'" in Path(php_path).read_text():
    raise SystemExit('Blob setting already exists; no changes applied.')
php = load(php_path, 'c60131dbec43bff091513753b1e73ffdbd007b2e')
js = load(js_path, '9dcffb0ccaf1b810c66e14ce7fabbf3e8c1646b5')
readme = load(readme_path, '8a364b239d74a110955be996ae2c05ac227ccca8')
php = replace(php, ' * Version: 1.3.5', ' * Version: 1.3.6')
php = replace(php, "define( 'PDF_LAZY_LOADER_VERSION',      '1.3.5' );", "define( 'PDF_LAZY_LOADER_VERSION',      '1.3.6' );")
anchor = "add_filter( 'pre_update_option_pdf_lazy_loader_server_verify',    'pdf_lazy_loader_update_checkbox', 10, 2 );"
php = replace(php, anchor, anchor + "\nadd_filter( 'pre_update_option_pdf_lazy_loader_blob_download', 'pdf_lazy_loader_update_checkbox', 10, 2 );")
anchor = 'function pdf_lazy_loader_register_settings() {'
php = replace(php, anchor, anchor + "\n    register_setting( 'pdf_lazy_loader_settings', 'pdf_lazy_loader_blob_download', array( 'type' => 'boolean', 'sanitize_callback' => 'pdf_lazy_loader_sanitize_checkbox', 'default' => false ) );")
anchor = "        'serverVerify'        => false,"
php = replace(php, anchor, "        'blobDownload'        => $to_bool( get_option( 'pdf_lazy_loader_blob_download', false ) ),\n" + anchor)
anchor = "        'retry'        => __( 'Try again', 'pdf-lazy-loader' ),"
php = replace(php, anchor, anchor + "\n        'downloading'  => __( 'Preparing download...', 'pdf-lazy-loader' ),\n        'downloadFailed' => __( 'Download failed. Please try again. External files must allow CORS.', 'pdf-lazy-loader' ),")
anchor = '            <div class="pll-section">\n                <div class="pll-section__header"><span class="pll-section__icon">📐</span>'
row = '''
            <div class="pll-section">
                <div class="pll-section__header"><h2 class="pll-section__title"><?php esc_html_e( 'Downloads', 'pdf-lazy-loader' ); ?></h2></div>
                <table class="form-table pll-table">
                    <tr>
                        <th scope="row"><label for="pdf_lazy_loader_blob_download"><?php esc_html_e( 'Download via Blob', 'pdf-lazy-loader' ); ?></label></th>
                        <td>
                            <input type="hidden" name="pdf_lazy_loader_blob_download" value="0" />
                            <label class="pll-toggle">
                                <input type="checkbox" id="pdf_lazy_loader_blob_download" name="pdf_lazy_loader_blob_download" value="1" <?php checked( $settings['blobDownload'], true ); ?> />
                                <span class="pll-toggle__slider"></span>
                            </label>
                            <span class="description"><?php esc_html_e( 'Applies to the facade Download button only (enable Show Download Button above). The complete PDF is fetched before saving through a temporary Blob URL. External files require CORS. The original request remains visible in developer tools. No direct-link fallback is used on failure.', 'pdf-lazy-loader' ); ?></span>
                        </td>
                    </tr>
                </table>
            </div>

'''
php = replace(php, anchor, row + anchor)
anchor = "        'pdf_lazy_loader_debug_mode', 'pdf_lazy_loader_db_version',"
php = replace(php, anchor, "        'pdf_lazy_loader_blob_download',\n" + anchor)
js = replace(js, "raw.version || '1.3.5'", "raw.version || '1.3.6'")
js = replace(js, "            enableDownload:   toBool(raw.enableDownload),", "            enableDownload:   toBool(raw.enableDownload),\n            blobDownload:     toBool(raw.blobDownload),")
js = replace(js, "        retry: 'Try again'", "        downloading: 'Preparing download...',\n        downloadFailed: 'Download failed. Please try again. External files must allow CORS.',\n        retry: 'Try again'")
old = '''        triggerDownload(url) {
            if (!url) return;
            const a = document.createElement('a');
            a.href = url; a.download = ''; a.style.display = 'none';
            document.body.appendChild(a); a.click(); a.remove();
        }
'''
new = '''        async triggerDownload(url) {
            if (!url) throw new Error('Missing PDF URL');
            if (!this.options.blobDownload) {
                const a = document.createElement('a');
                a.href = url; a.download = ''; a.style.display = 'none';
                document.body.appendChild(a); a.click(); a.remove();
                return;
            }

            const source = new URL(url, window.location.href);
            if (!/^https?:$/.test(source.protocol)) throw new Error('Unsupported download URL');
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000);
            let blob;
            try {
                const response = await fetch(source.href, {
                    credentials: 'same-origin', signal: controller.signal
                });
                if (!response.ok) throw new Error('Download HTTP ' + response.status);
                blob = await response.blob();
                if (!blob.size) throw new Error('Empty download');
                // Reject HTML error/login pages returned with HTTP 200.
                const header = await blob.slice(0, 1024).text();
                if (!header.includes('%PDF-')) throw new Error('Response is not a PDF');
            } finally {
                clearTimeout(timeout);
            }

            let name = source.pathname.split('/').pop() || '';
            try { name = decodeURIComponent(name); } catch (_) {}
            name = name.replace(/[\\\\/<>:"|?*\\x00-\\x1f\\x7f\\u202a-\\u202e\\u2066-\\u2069]/g, '_').slice(0, 180);
            if (!/\\.pdf$/i.test(name)) name = 'document.pdf';
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl; a.download = name; a.style.display = 'none';
            try {
                document.body.appendChild(a);
                a.click();
            } finally {
                a.remove();
                // Allow browsers to consume the URL before releasing the Blob.
                setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
            }
        }

        async downloadForFacade(wrapper, url) {
            if (wrapper.classList.contains('is-busy')) return;
            wrapper.classList.add('is-busy');
            const buttons = Array.from(wrapper.querySelectorAll('button'));
            const disabled = buttons.map(b => b.disabled);
            buttons.forEach(b => { b.disabled = true; });
            const old = wrapper.querySelector('.pdf-facade-error');
            if (old) old.remove();
            if (this.options.blobDownload) {
                this.showSpinner(wrapper);
                const label = wrapper.querySelector('.pdf-loading-text');
                if (label) label.textContent = this.options.i18n.downloading;
            }
            try {
                await this.triggerDownload(url);
                const content = wrapper.querySelector('.pdf-facade-content');
                const spinner = wrapper.querySelector('.pdf-loading-spinner');
                if (spinner) spinner.remove();
                if (content) content.classList.remove('is-loading');
                wrapper._pllSpinStart = 0;
            } catch (err) {
                this.debug('Download error:', err);
                this.showFacadeError(wrapper, this.options.i18n.downloadFailed);
            } finally {
                wrapper.classList.remove('is-busy');
                buttons.forEach((b, i) => { b.disabled = disabled[i]; });
            }
        }
'''
js = replace(js, old, new)
js = replace(js, '                    this.triggerDownload(e.pdf);', '                    void this.downloadForFacade(wrapper, e.pdf);')
js = replace(js, "            const doDownload = () => this.triggerDownload(this.decryptURL(wrapper.getAttribute('data-pdf-url-enc') || ''));", "            const doDownload = () => { void this.downloadForFacade(wrapper, this.decryptURL(wrapper.getAttribute('data-pdf-url-enc') || '')); };")
anchor = '| Show Download Button | Off | Adds a Download button next to View PDF |'
readme = replace(readme, anchor, anchor + '\n| Download via Blob | Off | Fetches the complete PDF before saving through a temporary Blob URL; only affects the facade Download button |')
anchor = '## Limits\n'
readme = replace(readme, anchor, '''## Blob downloads

Enable **Download via Blob** together with **Show Download Button** to save using a temporary `blob:` URL. PDF viewing, the viewer toolbar and Turnstile validation are unchanged. The filename is taken from the PDF URL, with `document.pdf` as a fallback.

The complete file must be received before saving, so large PDFs can take longer and require additional browser resources. External hosts must allow CORS. HTTP errors, empty/non-PDF responses and requests exceeding 120 seconds show an error and allow a retry; there is no automatic direct-link fallback. The original URL remains visible in developer tools. Download-history presentation depends on the browser and is not a security guarantee.

''' + anchor)
readme = replace(readme, '### v1.3.5\n', '''### v1.3.6
- Optional Download via Blob setting (off by default), with busy state, error handling and retry; no direct-link fallback
- PDF viewing and server-side Turnstile validation are unchanged

### v1.3.5
''')
for path, content in [(php_path, php), (js_path, js), (readme_path, readme)]:
    Path(path).write_text(content, encoding='utf-8')
