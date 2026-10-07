# PDF Lazy Loader v1.2.1

WordPress plugin that defers **PDF Embedder / PDF Embedder Premium** output behind a lightweight click-to-load facade. Nothing PDF-related — viewer iframe, PDF file, viewer CSS/JS — is requested until the visitor clicks **View PDF** (and, optionally, passes Cloudflare Turnstile). This keeps pages light and hides PDFs from naive bots.

## Features

- **Server-rendered facade**: the placeholder is part of the HTML (`the_content` filter) — visible before any JS runs, no layout shift (CLS), page-cache friendly
- **Zero PDF assets on page load**: PDF Embedder CSS/JS (including `pdfemb-fullscreen.min.css` enqueued inside `Viewer::render()`) are captured and loaded only on click
- **Localized data preserved**: `wp_localize_script()` / `wp_add_inline_script()` data attached to PDF Embedder handles (e.g. `pdfemb_trans`) is carried over, so deferred scripts work exactly as when loaded normally
- **Fast click-to-view**: minimum spinner time runs *in parallel* with asset loading (default 300 ms); static viewer assets are preloaded on hover / focus / touch
- **Cloudflare Turnstile**: optional client-side verification before the PDF loads (widget script is also preloaded on intent)
- **URL obfuscation**: iframe `src` is replaced by an XOR + Base64 copy in `data-pdf-lazy-original-src-enc`
- **Responsive facade**: heights per breakpoint via CSS custom properties and `@media` (no resize listeners)
- **Accessible by default (WCAG AA)**: button/icon colors are auto-darkened (same hue) until white text reaches 4.5:1; all facade texts meet 4.5:1; no heading tags in the facade (does not break the page heading outline)
- **No render-blocking request**: facade CSS (~3 KB) is inlined in `<head>`; frontend JS is minified (`pdf-lazy-loader.min.js`, ~4 KB gzip) and deferred
- **Download button** (optional), **Debug mode**, translatable strings (`pdf-lazy-loader` text domain)
- **WordPress 7.x**: tested up to 7.1, requires PHP 7.4+, script tags via `wp_get_inline_script_tag()` (CSP-nonce friendly), frontend JS with `defer` strategy

## How It Works

### Page Load (before user interaction)

1. **Detection** — `pdf_lazy_loader_has_pdf_iframes()` checks every post of the main query (single pages, blog index, archives, search). Result is memoized per request (tri-state); pages without PDF are not touched at all — no CSS/JS/inline script from this plugin is printed there
2. **`the_content:999`** — each PDF iframe gets its `src` removed (obfuscated copy kept in a data attribute), the class `pll-iframe-hidden`, and a server-side facade is printed right before it
3. **Layer 1** — `wp_enqueue_scripts:999`: queued PDF Embedder styles/scripts are collected (final URL incl. `?ver=`, deps in order, localized data, inline before/after) and dequeued
4. **Layer 2** — `wp_footer:1`: same collection after all shortcodes ran — catches `pdf-fullscreen` (`pdfemb-fullscreen.min.css`) enqueued inside `Viewer::render()`
5. **ob_start** — `template_redirect:1`: one `preg_replace_callback` pass strips any PDF Embedder `<link>`/`<script src>` printed outside the queue and prints the final list once as `window.pdfLazyLoaderLateAssets` before `</body>` (Layer 3 `wp_footer:2` is used only as a fallback when the buffer is not active)
6. The PDF Embedder viewer request itself (`/?pdfemb-data=…`, rendered inside the iframe) is never modified

### On Hover / Focus / Touch

Viewer CSS/JS (and Turnstile `api.js`, when enabled) start downloading in the background. The PDF file and the viewer iframe are **not** requested yet.

### On Click ("View PDF")

1. If Turnstile is enabled — the widget is shown first
2. Viewer assets (already cached after preload) and the minimum spinner delay are awaited in parallel
3. The facade is removed, the iframe `src` is restored — PDF Embedder works as usual, including fullscreen

## Installation

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate it in **Plugins**
3. Configure it in **Settings → PDF Lazy Loader**

## Configuration

### Basic Settings

| Setting | Description | Default |
|---|---|---|
| Button Color | Color of the "View PDF" button and PDF icon (auto-darkened for contrast if needed: `#FF6B6B` → `#C25151`) | `#FF6B6B` |
| Button Hover Color | Color on hover / focus | `#E63946` |
| Minimum Loading Time | Minimum spinner time in ms (0–5000), runs in parallel with asset loading | `300` |
| Show Download Button | Enable/disable the download button | Off |

On upgrade from ≤ 1.1.1 the old default `1500` is migrated to `300` once; any other custom value is kept.

### Facade Heights

| Breakpoint | Range | Default |
|---|---|---|
| Desktop | ≥ 1024px | 600px |
| Tablet | 768px – 1023px | 500px |
| Mobile | < 768px | 400px |

### Cloudflare Turnstile

- **Enable Turnstile** — show the verification widget before the PDF loads
- **Site Key** — your Turnstile site key ([Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile))
- **Secret Key** — stored for future server-side verification (not used by the current client-side flow)

### Debug Settings

- **Enable Debug Mode** — detailed logs in the browser console; disable in production

## Security Notes

- The URL "encryption" is **obfuscation** (XOR + Base64 with a key that is public in the page source). It defeats naive HTML parsers, not a determined scraper
- Turnstile is verified on the client only — it filters casual bots, but is not a server-side access control
- What really protects against bots here: no PDF URL in plain text, no viewer iframe and no viewer/PDF requests until a real interaction happens

## Technical Details

### Asset capture

Only **queued** PDF Embedder handles are collected (registered-but-unused files such as the free plugin's `pdf.js` when Premium renders the shortcode are never loaded). For every handle:

| Field | Source |
|---|---|
| `src` / `href` | built like `WP_Scripts`/`WP_Styles`: `base_url` for relative paths, `?ver=` (`default_version` when `ver === false`), `script_loader_src` / `style_loader_src` filters |
| `before` | `get_data( $handle, 'data' )` (`wp_localize_script`) + `before` inline scripts — printed immediately in the page (tiny, must exist before the deferred file) |
| `after` | `after` inline scripts — executed right after the deferred file loads |
| `media` / `inline` (CSS) | style `args` and `wp_add_inline_style()` content |

PDF Embedder dependencies are collected recursively in dependency order; non-PDF-Embedder deps (e.g. `jquery`) stay enqueued.

Path detector used everywhere:

```php
'/PDFEmbedder-premium-secure/', '/PDFEmbedder-premium/',
'/pdf-embedder-premium/', '/pdf-embedder/', '/pdfemb/'
```

### JavaScript

- One delegated `click` listener for all facades (server-rendered and JS-fallback)
- `loadPDFEmbedderAssets()` merges `pdfLazyLoaderData.pdfembAssets` + `window.pdfLazyLoaderLateAssets`; CSS in parallel, JS strictly sequential; dedup by file name; runs once
- `MutationObserver` is debounced (50 ms) and scans only added nodes
- Iframes that did not pass through `the_content` (page builders, dynamic markup) are handled by the early `<head>` interceptor + JS fallback facade
- Free PDF Embedder (`<a class="pdfemb-viewer">`, no iframe): no facade is possible, so its deferred assets are loaded immediately — the viewer is never left broken

### Filters

| Filter | Purpose |
|---|---|
| `pdf_lazy_loader_has_pdf` | Override page-level PDF detection (`bool`) |
| `pdf_lazy_loader_enforce_contrast` | `false` — use button colors exactly as entered (no WCAG adjustment) |
| `pdf_lazy_loader_inline_css` | `false` — load `pdf-lazy-loader.css` as an external file instead of inlining |

### Content filters

- `the_content`, `widget_text`, `widget_block_content` — facade + obfuscated iframe
- `rest_prepare_{post_type}` for every public post type with REST — obfuscated iframe, no facade markup

## File Structure

```
pdf-lazy-loader/
├── pdf-lazy-loader.php
├── README.md
└── assets/
    ├── css/
    │   ├── admin.css
    │   └── pdf-lazy-loader.css
    └── js/
        ├── admin.js
        ├── pdf-lazy-loader.js
        └── pdf-lazy-loader.min.js   (used unless SCRIPT_DEBUG)
```

## Requirements

- WordPress 5.7+ (tested up to 7.1)
- PHP 7.4+
- PDF Embedder Premium (Legacy) 5.3.x with PDF Embedder (free) active

## Version History

### v1.2.1
Fixes for Google PageSpeed / Lighthouse findings:
- **Accessibility — color contrast**: button and PDF icon colors are darkened (hue preserved) until white text reaches WCAG AA 4.5:1 (default `#FF6B6B` → `#C25151`, hover `#E63946` → `#A54545`); subtitle / info / loading / Turnstile texts darkened to ≥ 4.5:1 on the facade background. Admin preview shows the effective colors
- **Accessibility — heading order**: facade title is not a heading (`<h3>` removed in 1.2.0, admin preview aligned)
- **Performance — render-blocking request**: `pdf-lazy-loader.css` is inlined (minified) instead of a separate `<link>`
- **Performance — network dependency tree**: minified `pdf-lazy-loader.min.js` (24 KB → 13 KB, ~4 KB gzip), still `defer` in footer
- **Performance — LCP render delay**: facade is server-rendered (since 1.2.0), so the LCP text is painted with the first frame
- New filters: `pdf_lazy_loader_enforce_contrast`, `pdf_lazy_loader_inline_css`

### v1.2.0
- **Compatibility**: `Tested up to: 7.1`, `Requires PHP: 7.4`, `Requires at least: 5.7`; inline scripts via `wp_get_inline_script_tag()`
- **Fix**: localized data and inline scripts of deferred PDF Embedder handles (`pdfemb_trans` etc.) are preserved
- **Fix**: deferred asset URLs now include `?ver=` and use `base_url` for relative paths
- **Fix**: plugin no longer touches the PDF Embedder viewer request (`/?pdfemb-data=`) — previously viewer scripts could be stripped inside the iframe when the front page contained a PDF
- **Fix**: PDF detection scans all posts of the main query (archives / blog index), tri-state memoized
- **Fix**: REST filtering for every public post type, not only `post`
- **Perf**: server-side facade in `the_content` (no CLS, works before JS)
- **Perf**: spinner delay runs in parallel with asset loading, default 1500 → 300 ms (one-time migration)
- **Perf**: preload of viewer assets and Turnstile script on hover / focus / touch
- **Perf**: frontend JS loaded with `defer`; facade styles moved from inline JS to CSS with custom properties and `@media` (no resize listeners)
- **Perf**: debounced `MutationObserver` that only scans added nodes; single-pass `ob_start` callback with fast exit; Layer 3 no longer duplicated by the buffer
- **Perf**: only queued PDF Embedder handles are deferred — unused registered files are never downloaded
- **i18n**: all facade/admin strings translatable (`pdf-lazy-loader`)
- **Cleanup**: `substr()` → `slice()`, `wp_unslash()` for `$_POST`, enqueue hook moved to its own priority (1000), Turnstile widget re-render on retry
- **Safety**: free PDF Embedder without Premium — deferred assets load immediately instead of leaving the viewer broken

### v1.1.1
- **Refactor**: Replaced `wp_localize_script()` with `wp_add_inline_script(..., 'before')` on both frontend (`pdfLazyLoaderData`) and admin (`pdfLazyLoaderAdmin`) scripts — forward-compatible with WP 7.x
- **Updated**: `Tested up to: 6.7` → `6.8`
- **Updated**: README — added "WP 7.x Ready" feature note, new "Data Passing to JavaScript" technical section

### v1.1.0
- **Fix**: `pdfemb-fullscreen.min.css` (and all other PDFEmbedder-premium assets registered inside shortcode `render()`) now guaranteed to load on click
- **New**: Layer 2 — `wp_footer:1` full scan of `$wp_styles->registered` / `$wp_scripts->registered` by plugin path after all shortcodes execute
- **New**: Layer 3 — `wp_footer:2` injects `window.pdfLazyLoaderLateAssets` before `</body>` with the complete final asset list
- **New**: `pdf_lazy_loader_is_pdfemb_src()` centralized path-based detector used across all layers
- **Fix**: JS CSS dedup no longer uses `CSS.escape()` — fixes `querySelector` failing for filenames with dots (e.g. `pdfemb-fullscreen.min.css`)
- **Improved**: `ob_start` regex broadened to path-segment match; updates `window.pdfLazyLoaderLateAssets` before `</body>` if new URLs found
- **Improved**: `pdfemb-fullscreen`, `pdfemb-all-premium`, `pdfemb-print` added to dequeue handle list

### v1.0.9
- Added `ob_start` HTML output buffer on `template_redirect` to strip PDF Embedder `<link>`/`<script>` tags enqueued late inside shortcode `render()` callbacks
- Added `pdf-fullscreen` handle to the dequeue list
- Fixed `pdfemb-fullscreen.min.css` partial capture

### v1.0.8
- Added on-demand PDF Embedder asset loading (`loadPDFEmbedderAssets()`)
- `wp_dequeue_style` / `wp_dequeue_script` for all known PDF Embedder handles at priority 999
- Deferred asset URLs passed to JS via `wp_localize_script`
- Assets injected into DOM only after user clicks "View PDF"

### v1.0.6
- Added URL encryption (XOR + Base64)
- Server-side content filtering
- Cloudflare Turnstile integration
- Responsive facade heights
- Debug mode
- Improved iframe interception

### v1.0.4
- Fixed download button toggle
- Fixed PDF background loading
- Removed unnecessary settings
- All text in English

## License

GPL v2 or later

## Support

For issues and questions, enable Debug Mode in plugin settings and check the browser console (F12).
