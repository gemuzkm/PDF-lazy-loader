# PDF Lazy Loader

Click-to-load facade for **PDF Embedder Premium** on WordPress. The viewer iframe, the PDF file and the viewer's CSS/JS are not requested until a visitor clicks **View PDF** — optionally after a Cloudflare Turnstile check.

## What it does

- **Lighter pages.** Nothing PDF-related loads with the page. The facade is plain HTML rendered on the server with its CSS inlined, so it appears with the first paint, causes no layout shift and works with full-page caching.
- **Fewer automated downloads.** The PDF address is not present in the page source in readable form. With server-side verification it is not in the page at all until Turnstile is passed.
- **Unchanged viewer.** After the click PDF Embedder works as usual, including fullscreen.
- **Accessible facade.** Button colors are darkened automatically until white text reaches WCAG AA contrast (4.5:1), and the facade adds no headings to the page outline.

## Requirements

- WordPress 5.7 or later (tested up to 7.1), PHP 7.4 or later
- PDF Embedder Premium (Legacy) 5.3.x with the free PDF Embedder plugin active
- For server-side verification: Cloudflare Turnstile site and secret keys, PHP OpenSSL with `aes-256-gcm`

## Installation

1. Upload the plugin folder to `/wp-content/plugins/`, or install the ZIP from the [Releases](https://github.com/gemuzkm/PDF-lazy-loader/releases) page.
2. Activate the plugin.
3. Open **Settings → PDF Lazy Loader**.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Button Color / Button Hover Color | `#FF6B6B` / `#E63946` | Shown darker when contrast requires it (`#C25151` / `#A54545` for the defaults) |
| Minimum Loading Time | 300 ms | Minimum spinner time, 0–5000 ms; runs in parallel with loading the viewer files |
| Show Download Button | Off | Adds a Download button next to View PDF |
| Facade height: desktop / tablet / mobile | 600 / 500 / 400 px | Breakpoints: ≥ 1024 px, 768–1023 px, < 768 px |
| Enable Turnstile | Off | Shows the Turnstile widget before a PDF is opened or downloaded |
| Site Key, Secret Key | — | The secret key is used only on the server and is never printed back into the form |
| Server-side verification | Off | See [Turnstile modes](#turnstile-modes) |
| Debug Mode | Off | Logs to the browser console; keep it off in production |

## How it works

1. **Page render.** In post content every PDF iframe loses its `src`, and a facade is printed in front of it. PDF Embedder's styles and scripts are held back.
2. **Hover, focus or touch.** The browser preloads the viewer files (`<link rel="preload">`). Nothing is executed and the PDF is not requested.
3. **Click.** Turnstile runs if it is enabled, the viewer files are applied, and the iframe gets its `src` back.

Iframes that do not come from post content (page builders, content inserted by scripts) get the same facade from JavaScript. Pages without PDFs are not touched.

## Turnstile modes

| | Client-side (default) | Server-side |
|---|---|---|
| In the page source | Obfuscated copy of the address (XOR + Base64, public key) | AES-256-GCM sealed reference; the key never leaves the server |
| Token check | In the browser only | Cloudflare `siteverify`, called by the server |
| Extra cost | None | One REST request per post with PDFs, on the first click; no database writes |

Notes on server-side verification:

- One solved challenge opens the PDFs of one post. On archive pages each post asks for its own check.
- The `siteverify` answer must carry the action `pdf_view` and the site's host name. If the site is reachable under several host names, turn the host check off with the `pdf_lazy_loader_verify_hostname` filter.
- If Cloudflare cannot be reached within 5 seconds, the PDF is not released and the visitor can try again.
- Allow `POST /wp-json/pdf-lazy-loader/v1/verify` in your firewall rules. A Content-Security-Policy needs `https://challenges.cloudflare.com` in `script-src` and `frame-src`.
- Requests are limited to 20 per minute per IP address when a persistent object cache (Redis, Memcached) is available; without one there is no limit. The address is `REMOTE_ADDR`: behind a proxy or CDN the web server has to restore the visitor address.
- Changing the WordPress salts invalidates the references in cached pages; purge the page cache afterwards.

## Limits

- Client-side mode is obfuscation, not protection: it stops simple HTML scrapers, not someone who runs the page's JavaScript.
- Server-side mode hides the address until Turnstile is passed, but the PDF remains a public file. Anyone who already knows its URL can download it.
- The facade needs the iframe that PDF Embedder **Premium** renders. With only the free plugin there is no iframe, so no facade is shown and the viewer loads normally.

## For developers

| Filter | Purpose |
|---|---|
| `pdf_lazy_loader_has_pdf` | Override the per-page PDF detection (`bool`) |
| `pdf_lazy_loader_enforce_contrast` | `false` — use the button colors exactly as entered |
| `pdf_lazy_loader_inline_css` | `false` — load the facade stylesheet as a file instead of inlining it |
| `pdf_lazy_loader_verify_timeout` | `siteverify` timeout in seconds (default `5`) |
| `pdf_lazy_loader_verify_rate_limit` | Requests per minute per IP for `/verify` (default `20`, `0` turns it off) |
| `pdf_lazy_loader_verify_hostname` | `false` — do not compare the `siteverify` host name with the site host |
| `pdf_lazy_loader_verify_send_ip` | `true` — send the visitor address to `siteverify` |
| `pdf_lazy_loader_client_ip` | Visitor address used for the rate limit (default `REMOTE_ADDR`) |

REST API responses (`content.rendered`) contain the iframe without `src` and no facade markup.

Build and release:

- `assets/js/pdf-lazy-loader.min.js` is built with terser by the **Build assets** workflow on every push that changes the source file. Do not edit it by hand.
- **CI** checks PHP syntax on 7.4–8.4, JavaScript syntax, that the version is the same in the plugin header, `PDF_LAZY_LOADER_VERSION` and the JS fallback, and that this file has a `### vX.Y.Z` entry.
- Pushing a `vX.Y.Z` tag runs the **Release** workflow: it builds the ZIP and publishes it with the notes from the matching changelog entry.

```bash
git pull    # brings in the "build: rebuild pdf-lazy-loader.min.js" commit
git tag -a v1.3.5 -m "PDF Lazy Loader 1.3.5"
git push origin v1.3.5
```

## Changelog

### v1.3.5
- Hover, focus and touch now only preload the viewer files (`<link rel="preload">`); viewer scripts run after the click
- Removed the bundled Cloudflare address list and the `pdf_lazy_loader_cloudflare_ranges` filter. The visitor address is `REMOTE_ADDR`; restoring it behind a proxy is the web server's job (the `pdf_lazy_loader_client_ip` filter remains)
- Settings page: the live preview is the real facade and follows color, height and Download changes; only the "Settings saved" notice is dismissed automatically; error notices keep their colors; unused code removed
- README rewritten

### v1.3.4
- `/verify` rejects a `siteverify` answer without `action` or `hostname`
- REST responses no longer contain facade markup; content inserted into a page from REST gets the facade from JavaScript
- Deferred assets are matched by URL instead of file name
- A facade opens its own iframe when `pll-N` IDs repeat on a page
- `pdf-lazy-loader.min.js` is built by GitHub Actions

### v1.3.3
- `?pdfemb-data=` can no longer switch the facade off on a normal page or in REST output: the viewer request is detected the way PDF Embedder Premium detects it (front page + non-empty parameter)

### v1.3.2
- Sealed references are bound to their post; one Turnstile token opens the PDFs of one post
- Turnstile failures restore the buttons, show a message and allow a retry
- Non-ASCII PDF addresses work in the obfuscated mode

### v1.3.1
- Turnstile widget is removed through its API after success
- Minimum spinner time counts from the moment the spinner appears

### v1.3.0
- Server-side Turnstile verification: REST endpoint, AES-256-GCM sealed references, optional rate limit

### v1.2.1
- Contrast-safe button colors, facade CSS inlined, minified frontend script

### v1.2.0
- Server-rendered facade, preload on intent, WordPress 7.x compatibility, PDF detection on archive pages

Earlier versions: see the commit history.

## License

GPL v2 or later.
