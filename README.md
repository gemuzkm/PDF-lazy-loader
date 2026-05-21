# PDF Lazy Loader v1.1.0

WordPress plugin that optimizes PDF loading with lazy loading pattern for better performance and user experience. Replaces PDF iframes with a preview facade that loads the actual PDF only when user clicks. Protects PDF assets from bots by deferring all PDF-related resources until after user interaction and optional Cloudflare Turnstile verification.

## Features

- **Lazy Loading**: PDFs load only when user clicks "View PDF" button
- **3-Layer Asset Capture**: Guarantees all PDF Embedder CSS/JS (including `pdfemb-fullscreen.min.css` registered inside shortcodes) are captured and injected on-demand — regardless of when PDF Embedder registers them in the WordPress lifecycle
- **URL Encryption**: PDF URLs are encrypted using XOR + Base64 to prevent scraping
- **Cloudflare Turnstile**: Optional bot protection — verification is required before the PDF loads
- **Responsive Facade**: Configurable placeholder heights for desktop, tablet, and mobile
- **Download Support**: Optional download button for PDF files
- **Debug Mode**: Detailed console logging for troubleshooting
- **Server-Side Protection**: PHP content filters remove PDF URLs from HTML source before sending to browser

## How It Works

### Page Load (before user interaction)

1. **Layer 1** — `wp_enqueue_scripts:999`: PHP dequeues all known PDF Embedder style/script handles and scans the queue by src path
2. **Layer 2** — `wp_footer:1`: After all shortcodes have executed, scans the entire `$wp_styles->registered` / `$wp_scripts->registered` by plugin directory path — catches late-registered assets like `pdfemb-fullscreen.min.css` that PDF Embedder enqueues inside `Viewer::render()`
3. **Layer 3** — `wp_footer:2`: Outputs the final merged asset list as `window.pdfLazyLoaderLateAssets` inline script before `</body>`
4. **ob_start buffer** — `template_redirect:1`: Strips any surviving PDF Embedder `<link>`/`<script>` tags from the HTML stream using a broad path-based regex
5. PDF iframes are intercepted server-side and client-side — their `src` is encrypted and removed from HTML
6. A lightweight facade placeholder is rendered instead of the PDF

### On Click ("View PDF" button)

1. If Cloudflare Turnstile is enabled — verification widget appears first
2. After successful verification (or immediately if Turnstile is disabled) — `loadPDFEmbedderAssets()` merges `pdfLazyLoaderData.pdfembAssets` (Layer 1) with `window.pdfLazyLoaderLateAssets` (Layers 2–3), then injects all CSS/JS into the DOM
3. The iframe `src` is restored and the PDF loads normally

## Installation

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate the plugin through the **Plugins** menu in WordPress
3. Go to **Settings → PDF Lazy Loader** to configure

## Configuration

### Basic Settings

| Setting | Description | Default |
|---|---|---|
| Button Color | Color of the "View PDF" button | `#FF6B6B` |
| Button Hover Color | Color on hover | `#E63946` |
| Loading Animation Duration | Spinner duration in ms (500–5000) | `1500` |
| Show Download Button | Enable/disable download functionality | Off |

### Facade Heights

| Breakpoint | Range | Default |
|---|---|---|
| Desktop | ≥1024px | 600px |
| Tablet | 768px – 1023px | 500px |
| Mobile | <768px | 400px |

### Cloudflare Turnstile

- **Enable Turnstile**: Enable bot verification before PDF loads
- **Turnstile Site Key**: Your Cloudflare Turnstile site key ([get it here](https://dash.cloudflare.com/?to=/:account/turnstile))
- **Turnstile Secret Key**: Your Cloudflare Turnstile secret key (stored securely)

### Debug Settings

- **Enable Debug Mode**: Outputs detailed logs to the browser console — disable in production

## Security Features

- PDF URLs encrypted with XOR cipher + Base64 — no plaintext URLs in HTML source
- Server-side `the_content` filter removes PDF src attributes before page is sent to browser
- Early inline JS intercepts dynamically created iframes via MutationObserver
- All PDF Embedder CSS/JS stripped from page until user clicks — reduces attack surface for bots
- Optional Cloudflare Turnstile verification gate before any PDF asset loads

## Technical Details

### 3-Layer Asset Capture (v1.1.0+)

PDF Embedder (especially premium versions) registers assets at multiple points in the WordPress lifecycle:

- **Layer 1 — `wp_enqueue_scripts:999`**: Dequeues handles from a known list (`pdfemb-fullscreen`, `pdfemb-frontend`, `pdfemb-pdf-viewer`, etc.) plus any handle in the queue whose `src` path contains a PDF Embedder directory segment.

- **Layer 2 — `wp_footer:1`**: After `the_content` and all shortcodes have executed, scans **all** entries in `$wp_styles->registered` and `$wp_scripts->registered` using `pdf_lazy_loader_is_pdfemb_src()`. This is the definitive catch for `pdfemb-fullscreen.min.css` and similar assets that `Viewer::render()` registers only at shortcode execution time — after Layer 1 has already run.

- **Layer 3 — `wp_footer:2`**: Outputs the final merged URL list as `window.pdfLazyLoaderLateAssets = {...}` before `</body>`. JavaScript reads this global at click time and merges it with the early list from `wp_localize_script`.

**Path-based detector** used by all layers:
```php
function pdf_lazy_loader_is_pdfemb_src( $src ) {
    $markers = [
        '/PDFEmbedder-premium-secure/',
        '/PDFEmbedder-premium/',
        '/pdf-embedder-premium/',
        '/pdf-embedder/',
        '/pdfemb/',
    ];
    foreach ( $markers as $m ) {
        if ( stripos( $src, $m ) !== false ) return true;
    }
    return false;
}
```

### ob_start Buffer

Attached to `template_redirect:1` — only activated on pages that contain PDF content. Strips any surviving PDF Embedder `<link>`/`<script>` tags from the final HTML using a path-based regex. If new URLs are found that weren't captured by Layers 1–2, the buffer updates `window.pdfLazyLoaderLateAssets` before `</body>`.

### JS Asset Injection (`loadPDFEmbedderAssets()`)

Called once when the user clicks "View PDF":

- Merges `pdfLazyLoaderData.pdfembAssets` (early) with `window.pdfLazyLoaderLateAssets` (late)
- CSS is injected immediately (non-blocking); duplicates detected via `link.href.includes(filename)` — **no `CSS.escape()`** which was breaking dedup for filenames containing dots
- JS scripts are loaded **sequentially** (`async=false`) to preserve PDF.js worker → viewer load order
- Assets are injected only once — subsequent clicks skip injection

### Server-Side Filtering

The plugin hooks into WordPress content filters to strip PDF `src` attributes:

- `the_content` — main post/page content
- `widget_text` — classic text widgets
- `widget_block_content` — block-based widgets
- `rest_prepare_post` — REST API responses

### Client-Side Interception

An inline script injected at `wp_head:1` intercepts PDF iframes before they start loading:

- Runs immediately on `<head>` — before any theme or plugin JS
- MutationObserver watches for dynamically added iframes
- Encrypts `src` into `data-pdf-lazy-original-src-enc` and removes `src`

### Encryption

- **Algorithm**: XOR cipher with Base64 encoding
- **Key**: `pdf-lazy-loader-secure-key-2024`
- **Parity**: Identical implementation in PHP (`pdf_lazy_loader_encrypt_url()`) and JavaScript (`encryptURL()` / `decryptURL()`)

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
        └── pdf-lazy-loader.js
```

## Requirements

- WordPress 5.0 or higher
- PHP 7.2 or higher
- JavaScript enabled in browser
- PDF Embedder (free or premium) installed and active

## Version History

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
