# PDF Lazy Loader v1.0.9

WordPress plugin that optimizes PDF loading with lazy loading pattern for better performance and user experience. Replaces PDF iframes with a preview facade that loads the actual PDF only when user clicks. Protects PDF assets from bots by deferring all PDF-related resources until after user interaction and optional Cloudflare Turnstile verification.

## Features

- **Lazy Loading**: PDFs load only when user clicks "View PDF" button
- **Asset Deferral**: All PDF Embedder CSS/JS assets are stripped from the page on load and injected on-demand after user interaction — including assets enqueued inside shortcodes (via `ob_start` HTML filter)
- **URL Encryption**: PDF URLs are encrypted using XOR + Base64 to prevent scraping
- **Cloudflare Turnstile**: Optional bot protection — verification is required before the PDF loads
- **Responsive Facade**: Configurable placeholder heights for desktop, tablet, and mobile
- **Download Support**: Optional download button for PDF files
- **Debug Mode**: Detailed console logging for troubleshooting
- **Server-Side Protection**: PHP content filters remove PDF URLs from HTML source before sending to browser

## How It Works

### Page Load (before user interaction)

1. PHP intercepts all PDF Embedder assets via `wp_dequeue_style` / `wp_dequeue_script` at `wp_enqueue_scripts` priority 999
2. An `ob_start` buffer on `template_redirect` strips any `<link>` / `<script>` tags for PDF Embedder that were enqueued late (e.g. inside shortcode `render()` callbacks, after `wp_print_styles` has already fired)
3. PDF iframes are intercepted server-side and client-side — their `src` is encrypted and removed from HTML
4. A lightweight facade placeholder is rendered instead of the PDF

### On Click ("View PDF" button)

1. If Cloudflare Turnstile is enabled — verification widget appears first
2. After successful verification (or immediately if Turnstile is disabled) — deferred PDF Embedder CSS/JS assets are injected into the page
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

### Asset Deferral (v1.0.8+)

PDF Embedder enqueues its assets at two different points in the WordPress lifecycle:

- **Standard assets** registered via `wp_enqueue_scripts` → removed by `wp_dequeue_style` / `wp_dequeue_script` at priority 999
- **Late assets** (e.g. `pdf-fullscreen` CSS enqueued inside `Viewer::render()` during `the_content`) → removed by an `ob_start` HTML filter attached to `template_redirect` priority 1

The `ob_start` callback strips `<link>` and `<script>` tags whose `href`/`src` matches any PDF Embedder plugin folder path:
- `PDFEmbedder-premium`
- `PDFEmbedder-premium-secure`
- `pdf-embedder-premium`
- `pdf-embedder` (free version)

The buffer is only started on pages that contain PDF content — no overhead on other pages.

Deferred asset URLs are passed to JavaScript via `wp_localize_script` and injected on demand by `loadPDFEmbedderAssets()` — CSS is injected immediately, JS scripts are loaded sequentially to preserve PDF.js worker → viewer order. Assets are injected only once; subsequent clicks reuse the same loaded assets.

### Server-Side Filtering

The plugin hooks into WordPress content filters to strip PDF `src` attributes:

- `the_content` — main post/page content
- `widget_text` — classic text widgets
- `widget_block_content` — block-based widgets
- `rest_prepare_post` — REST API responses

### Client-Side Interception

An inline script injected at `wp_head` priority 1 intercepts PDF iframes before they start loading:

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

### v1.0.9
- Fixed `pdfemb-fullscreen.min.css` loading before user interaction
- Added `ob_start` HTML output buffer on `template_redirect` to strip PDF Embedder `<link>`/`<script>` tags enqueued late inside shortcode `render()` callbacks (after `wp_print_styles` has fired)
- Added `pdf-fullscreen` handle to the dequeue list as belt-and-suspenders fallback

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
