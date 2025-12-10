# PDF Lazy Loader v1.0.6

WordPress plugin that optimizes PDF loading with lazy loading pattern for better performance and user experience. Replaces PDF iframes with a preview facade that loads the actual PDF only when user clicks.

## Features

- **Lazy Loading**: PDFs load only when user clicks "View PDF" button
- **URL Encryption**: PDF URLs are encrypted to prevent scraping
- **Cloudflare Turnstile**: Optional bot protection before viewing/downloading PDFs
- **Responsive Design**: Configurable facade heights for desktop, tablet, and mobile
- **Download Support**: Optional download button for PDF files
- **Debug Mode**: Detailed console logging for troubleshooting
- **Server-Side Protection**: PHP filter removes PDF URLs from HTML source before sending to browser

## Installation

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to Settings → PDF Lazy Loader to configure

## Configuration

### Basic Settings

- **Button Color**: Color of the "View PDF" button
- **Button Hover Color**: Color on hover
- **Loading Animation Duration**: Duration in milliseconds (500-5000)
- **Show Download Button**: Enable/disable download functionality

### Facade Heights

- **Desktop** (≥1024px): Default 600px
- **Tablet** (768px-1023px): Default 500px
- **Mobile** (<768px): Default 400px

### Cloudflare Turnstile

- **Enable Turnstile**: Enable bot protection
- **Turnstile Site Key**: Your Cloudflare Turnstile site key
- **Turnstile Secret Key**: Your Cloudflare Turnstile secret key (stored securely)

### Debug Settings

- **Enable Debug Mode**: Enable detailed console logging (disable in production)

## Security Features

- PDF URLs encrypted using XOR cipher + Base64 encoding
- URLs removed from HTML source code (server-side filtering)
- No direct links visible in page source
- Optional Cloudflare Turnstile verification
- iframe hidden immediately to prevent background loading

## Technical Details

### Server-Side Filtering

The plugin filters content on the server side using WordPress filters:
- `the_content` - Main post/page content
- `widget_text` - Text widgets
- `widget_block_content` - Block widgets
- `rest_prepare_post` - REST API content

### Client-Side Interception

Inline JavaScript intercepts PDF iframes before they start loading:
- Prototype interception for `setAttribute` and `src` setter
- MutationObserver for dynamically added iframes
- Multiple execution strategies for early interception

### Encryption

- **Algorithm**: XOR cipher with Base64 encoding
- **Key**: `pdf-lazy-loader-secure-key-2024`
- **Compatibility**: Same algorithm in PHP and JavaScript

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

## Version History

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

For issues and questions, check the browser console (F12) with debug mode enabled.
