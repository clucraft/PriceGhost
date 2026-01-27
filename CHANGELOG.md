# Changelog

All notable changes to PriceGhost will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2026-01-26

### Added

- **Google Gemini AI Support** - New AI provider option alongside Anthropic, OpenAI, and Ollama
  - Supported models: Gemini 2.5 Flash Lite (default), Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 3 Flash Preview
  - Test API key button to verify connection before saving
  - Full support for AI extraction, verification, stock status checking, and price arbitration
  - Get API key from [Google AI Studio](https://aistudio.google.com/apikey)

---

## [1.0.5] - 2026-01-25

### Added

- **AI Model Selector** - Choose your preferred AI model in settings
  - Anthropic: Claude Haiku 4.5, Sonnet 4.5, Opus 4.5
  - OpenAI: GPT-4.1 Nano, Mini, and Full
  - Ollama: Any locally installed model
- **Per-Product AI Controls** - Disable AI extraction and/or verification on individual products
  - Useful for products where AI interferes with manual price selection
  - Separate toggles for extraction (fallback) and verification
- **Gotify Notification Support** - Self-hosted push notifications via Gotify
  - Test connection before saving to verify server URL and app token
  - Full notification support for price drops, target prices, and stock changes
- **AI Stock Status Verification** - Separate AI call to verify stock status for variant products
  - When tracking a specific variant price, AI now verifies if that exact variant is in stock
  - Fixes false "in stock" status when other variants are available but tracked variant is not
- **Pause/Resume Checking** - Temporarily pause price checking on individual products or in bulk
  - Pause and Resume actions in the bulk Actions menu
  - Filter dropdown to show All / Active / Paused products
  - Paused products are greyed out with pause icon indicator
  - Scheduler automatically skips paused products

### Fixed

- **Ollama Thinking Mode** - Fixed Qwen3 and DeepSeek models outputting `<think>` tags instead of JSON
  - Added `/nothink` message before prompts to disable thinking mode
  - Added `num_ctx: 16384` for proper context window (was truncating HTML at 4K)
  - Added fallback to strip `<think>` tags from responses
- **AI Stock Status "Unknown"** - AI now correctly returns "out_of_stock" for pre-order/coming soon products
  - Previously returned "unknown" even when reasoning stated product was unavailable
  - Prompt now explicitly requires "out_of_stock" when product cannot be purchased

### Changed

- **Recommended AI Models** - Based on testing:
  - **Cloud**: Claude Haiku 4.5 (best accuracy for the cost)
  - **Local/Free**: Qwen3 (any size, with thinking mode disabled)

---

## [1.0.4] - 2026-01-24

### Added

- **Multi-Strategy Price Voting System** - More robust price extraction using multiple methods
  - Runs all extraction methods (JSON-LD, site-specific, generic CSS, AI) in parallel
  - Uses consensus voting to select the correct price when methods agree
  - AI arbitration when extraction methods disagree
  - User price selection dialog when price is ambiguous (multiple prices found)
  - Remembers the winning extraction method for future checks of the same product
- **Price Selection Modal** - When multiple prices are found for a product, users can now select the correct one
  - Shows all price candidates with confidence levels
  - Displays extraction method and context for each candidate
  - Sorted by confidence (highest first)

### Changed

- **Improved scheduler** - Now uses preferred extraction method when available for faster, more accurate re-checks

---

## [1.0.3] - 2026-01-24

### Added

- **Notification History** - Complete log of all triggered notifications accessible via bell icon in navbar
  - Bell icon with badge showing recent notification count (last 24 hours)
  - Dropdown preview showing 5 most recent notifications
  - Full history page at `/notifications` with filtering by type
  - Tracks price drops, target price alerts, and back-in-stock notifications
  - Shows which channels (Telegram, Discord, Pushover, ntfy) received each notification
  - Links to product detail pages from notification entries
  - **Clear button** to dismiss notifications from dropdown without deleting history
- **Particle background effect** - Subtle animated particles floating behind all content
  - Theme-aware: white particles on dark mode, indigo on light mode
  - Multiple layers with varying speeds for depth effect
- **Star History chart** in README to track repository stars over time

### Fixed

- **Notification crash with string prices** - Fixed TypeError when notification prices were returned as strings from PostgreSQL

### Changed

- **Settings page layout** - Moved version info, changelog, and GitHub links to sidebar under navigation

---

## [1.0.2] - 2026-01-23

### Fixed

- **Stock status false positives** - Fixed overly aggressive pre-order detection that incorrectly marked in-stock items as out of stock. Pages with "in stock", "add to cart", or "add to basket" text now correctly prioritize these indicators
- **Magento 2 stock detection** - Added proper stock status detection for Magento 2 sites, checking for stock classes and add-to-cart buttons

---

## [1.0.1] - 2026-01-23

### Added

- **Puppeteer fallback for JavaScript-rendered prices** - Automatically uses headless browser when no price found in static HTML, fixing extraction for Magento, React, Vue, and other JS-heavy sites
- **Pre-order/coming soon detection** - Products with future release dates, pre-order buttons, or "notify me" messaging are now correctly marked as out of stock
- **AI availability verification** - AI now checks if products are actually purchasable, not just if the price is correct
- **Official PriceGhost branding** - Custom ghost icon in navbar and login page
- **Ghostly text effect** - "Ghost" text in navbar has ethereal fade effect

### Fixed

- **Fresh install registration error** - Backend now creates all required database tables on startup, fixing 500 errors on fresh Docker installs without init.sql
- **Stock status for unreleased products** - Products showing "Coming Soon", "Available [future date]", or "Pre-order" are now correctly detected as out of stock

### Changed

- **CI/CD optimization** - Docker images only rebuild when relevant code changes (backend/** or frontend/**), not for README or documentation updates

---

## [1.0.0] - 2026-01-23

### Added

#### Core Features
- Universal price scraping with site-specific extractors for Amazon, Walmart, Best Buy, Target, eBay, Newegg, Home Depot, Costco, and AliExpress
- JSON-LD structured data extraction for broad site compatibility
- Puppeteer headless browser fallback with stealth plugin for JavaScript-rendered pages
- Price history tracking with interactive charts (7d, 30d, 90d, all time)
- 7-day sparkline graphs on dashboard for quick trend overview
- Configurable check intervals (5 minutes to 24 hours)
- Live countdown timers and progress bars showing time until next check
- Staggered checking with jitter to prevent rate limiting

#### AI Features
- AI-powered price extraction fallback (Anthropic Claude, OpenAI GPT, Ollama local)
- AI price verification to catch scraping errors (e.g., scraping savings amounts instead of actual prices)
- AI status badges showing verification status (✓ verified, ⚡ corrected)

#### Notifications
- Telegram bot notifications
- Discord webhook notifications
- Pushover push notifications
- ntfy.sh notifications (no account required)
- Price drop alerts with configurable thresholds
- Target price alerts
- Back-in-stock alerts
- Per-channel enable/disable toggles
- Test notification buttons for each channel

#### Stock Tracking
- Out-of-stock detection with visual indicators
- Stock status history tracking
- Stock timeline visualization
- Back-in-stock notification alerts

#### User Interface
- Dark/Light mode with system theme auto-detection
- Responsive design for desktop and mobile
- Toast notifications for user feedback
- Dashboard with list layout, search, and sorting
- Bulk actions (select multiple products, bulk delete)
- Historical low price indicators
- Product notification badges showing configured alerts

#### User Management
- Multi-user support with JWT authentication
- Admin panel for user management
- Registration enable/disable control
- Profile management (name, password)
- Password visibility toggle for sensitive fields

#### PWA & Mobile
- Progressive Web App support
- Add to Home Screen capability
- Service worker for offline caching
- Custom ghost icon

#### Currency Support
- USD, EUR, GBP, CHF, CAD, AUD, JPY, INR support
- Automatic currency detection from scraped pages

#### Deployment
- Docker and Docker Compose support
- GitHub Container Registry images
- GitHub Actions CI/CD workflow

### Security
- JWT-based authentication
- bcrypt password hashing
- Input validation throughout
- Secure API design

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.6 | 2026-01-26 | Google Gemini AI support as new provider option |
| 1.0.5 | 2026-01-25 | AI model selector, per-product AI controls, Gotify support, Ollama fixes |
| 1.0.4 | 2026-01-24 | Multi-strategy price voting system with user selection for ambiguous prices |
| 1.0.3 | 2026-01-24 | Notification history with bell icon, clear button, and full history page |
| 1.0.2 | 2026-01-23 | Fixed stock status false positives for in-stock items |
| 1.0.1 | 2026-01-23 | Bug fixes, JS-rendered price support, pre-order detection |
| 1.0.0 | 2026-01-23 | Initial public release |
