from pathlib import Path
import hashlib


def replace(s, old, new):
    if s.count(old) != 1:
        raise RuntimeError('Expected one anchor: ' + old[:100])
    return s.replace(old, new, 1)


def load(path, expected):
    b = Path(path).read_bytes()
    actual = hashlib.sha1(b'blob %d\0' % len(b) + b).hexdigest()
    if actual != expected:
        raise RuntimeError('Source changed: ' + path)
    return b.decode('utf-8')


p = 'pdf-lazy-loader.php'
j = 'assets/js/pdf-lazy-loader.js'
r = 'README.md'
if '        loadAsset(a, type) {' in Path(j).read_text():
    raise SystemExit('Asset retry patch already applied.')
php = load(p, 'dde9e47192ff13b1adb23440104c00fdcc00c052')
js = load(j, 'c39d0e3412b16f7d1dc2ad7b034b90c8544b598f')
readme = load(r, '13d50c0e8e8db4dd9253829e331993b3ca176677')
php = replace(php, ' * Version: 1.3.6', ' * Version: 1.3.7')
php = replace(php, "define( 'PDF_LAZY_LOADER_VERSION',      '1.3.6' );", "define( 'PDF_LAZY_LOADER_VERSION',      '1.3.7' );")
php = replace(php, "        'retry'        => __( 'Try again', 'pdf-lazy-loader' ),", "        'assetsFailed' => __( 'Viewer files could not be loaded. Click View PDF to try again.', 'pdf-lazy-loader' ),\n        'retry'        => __( 'Try again', 'pdf-lazy-loader' ),")
js = replace(js, "raw.version || '1.3.6'", "raw.version || '1.3.7'")
js = replace(js, "        retry: 'Try again'", "        assetsFailed: 'Viewer files could not be loaded. Click View PDF to try again.',\n        retry: 'Try again'")
start = '        loadCSS(a) {'
end = '        // ------------------------------------------------------------------\n        // Client-side fallback'
if js.count(start) != 1 or js.count(end) != 1:
    raise RuntimeError('Unexpected asset loader boundaries')
a, b = js.index(start), js.index(end)
methods = '''        loadCSS(a) { return this.loadAsset(a, 'style'); }

        loadJS(a) { return this.loadAsset(a, 'script'); }

        // Only our own failed tags are removed. Successful and in-flight loads
        // are shared between all facades, preserving script dependency order.
        loadAsset(a, type) {
            if (!this._assetPromises) this._assetPromises = new Map();
            const url = type === 'style' ? a.href : a.src;
            const key = type + ':' + PDFLazyLoader.urlKey(url);
            if (this._assetPromises.has(key)) return this._assetPromises.get(key);
            const selector = type === 'style' ? 'link[rel="stylesheet"]' : 'script[src]';
            if (Array.from(document.querySelectorAll(selector)).some(n =>
                PDFLazyLoader.urlKey(type === 'style' ? n.href : n.src) === PDFLazyLoader.urlKey(url))) {
                return Promise.resolve();
            }

            const pending = new Promise((resolve, reject) => {
                const node = document.createElement(type === 'style' ? 'link' : 'script');
                let settled = false;
                let timer;
                const finish = error => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    node.onload = node.onerror = null;
                    if (error) {
                        node.remove();
                        reject(error);
                        return;
                    }
                    if (type === 'style' && a.inline) {
                        const inline = document.createElement('style');
                        inline.textContent = a.inline;
                        document.head.appendChild(inline);
                    }
                    if (type === 'script' && a.after) {
                        const inline = document.createElement('script');
                        inline.textContent = a.after;
                        document.head.appendChild(inline);
                    }
                    resolve();
                };
                node.onload = () => finish();
                node.onerror = () => finish(new Error('Asset failed: ' + url));
                timer = setTimeout(() => finish(new Error('Asset timeout: ' + url)), 30000);
                if (type === 'style') {
                    node.rel = 'stylesheet';
                    node.media = a.media || 'all';
                    node.href = url;
                } else {
                    node.async = false;
                    node.src = url;
                }
                document.head.appendChild(node);
            });
            const tracked = pending.catch(error => {
                this._assetPromises.delete(key);
                this.debug('Asset load failed:', url, error);
                throw error;
            });
            this._assetPromises.set(key, tracked);
            return tracked;
        }

        loadPDFEmbedderAssets() {
            if (this._assetsLoaded) return Promise.resolve();
            if (this._assetsLoading) return this._assetsLoading;
            const { css, js } = this.collectAssets();
            // Wait for both branches to settle before allowing another batch.
            // Otherwise a retry could overlap the previous JS dependency chain.
            const settle = promise => promise.then(() => null, error => error);
            this._assetsLoading = Promise.all([
                Promise.all(css.map(a => settle(this.loadCSS(a)))),
                settle(js.reduce((p, a) => p.then(() => this.loadJS(a)), Promise.resolve()))
            ]).then(([cssErrors, jsError]) => {
                const error = cssErrors.find(Boolean) || jsError;
                if (error) throw error;
                this._assetsLoaded = true;
            }).catch(error => {
                this._assetsLoaded = false;
                throw error;
            }).finally(() => {
                this._assetsLoading = null;
            });
            return this._assetsLoading;
        }

'''
js = js[:a] + methods + js[b:]
js = replace(js, "            Promise.all([this.loadPDFEmbedderAssets().catch(() => {}), minDelay]).then(() => {", "            Promise.all([this.loadPDFEmbedderAssets(), minDelay]).then(() => {")
js = replace(js, "                this.debug('iframe restored:', iframe.getAttribute('data-pll-id'));\n            });", "                this.debug('iframe restored:', iframe.getAttribute('data-pll-id'));\n            }).catch(error => {\n                wrapper.classList.remove('is-busy');\n                this.debug('Viewer assets unavailable:', error);\n                this.showFacadeError(wrapper, this.options.i18n.assetsFailed);\n            });")
js = replace(js, "            wrapper.classList.add('is-busy');\n            this.showSpinner(wrapper);\n\n            // Asset download", "            wrapper.classList.add('is-busy');\n            const old = wrapper.querySelector('.pdf-facade-error');\n            if (old) old.remove();\n            this.showSpinner(wrapper);\n\n            // Asset download")
readme = replace(readme, '### v1.3.6\n', '### v1.3.7\n- Viewer asset failures keep the facade visible and allow another attempt with View PDF\n- Failed plugin-created tags are removed; successful scripts are not executed again on retry\n- Concurrent facades share in-flight requests; scripts retain dependency order; asset timeout is 30 seconds\n\n### v1.3.6\n')
for path, text in [(p, php), (j, js), (r, readme)]:
    Path(path).write_text(text, encoding='utf-8')
