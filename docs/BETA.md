# PriceStalker Beta: How Product Scraping Works

Welcome to the new version of PriceStalker! This document provides a simple, high-level overview of how PriceStalker tracks product prices, uses AI to adapt to new stores, and ensures data accuracy.

---

## 1. Adding a Product
When you paste a product URL into PriceStalker (e.g., `https://example.com/product/cool-shoes`), the system starts a multi-phase scraping pipeline:

1. **URL Normalization**: The system strips out marketing trackers (like UTM codes) and cleans up formatting to ensure a consistent, unique link.
2. **Setup**: It resolves what store (retailer) the URL belongs to and figures out details like currency and country rules.

---

## 2. Scraping the HTML (Retrieval)
To read prices, PriceStalker first has to download the product web page:

* **Standard HTTP Fetch**: The system tries to load the page as fast and lightweight as possible using standard request tools.
* **Remote Stealth Browser Fallback**: If a store blocks basic requests (like Cloudflare or bot protection screens), PriceStalker automatically spins up a background stealth browser (`scraper`). This stealth browser mimics a real human user looking at the screen to read the page content.

---

## 3. Data Extraction (The Cascade)
Once the HTML is downloaded, the system denoises the page—stripping out heavy scripts, footers, headers, and navigation menus to keep only the core product content. It then checks for prices in a **7-layered cascade**:
1. **Structural Metadata** (JSON-LD data formatted for search engines like Google).
2. **Deal Selectors** (Temporary deals/sale prices).
3. **Member Selectors** (Loyalty/club prices).
4. **Pre-Order Selectors** (Upcoming release prices).
5. **Original Price Selectors** (Manufacturer's Suggested Retail Price/RRP).
6. **Custom Store Selectors** (Specific CSS paths tailor-made for that retailer).
7. **Generic Selectors** (Fallback patterns matching standard price structures).

---

## 4. Where AI Fits In (Enhanced, but Optional)
PriceStalker is built to be resilient, even without AI. However, enabling the AI Engine unlocks powerful benefits:

### AI Auto-Mapping
* **Without AI**: If a new store is added that doesn't have custom rules yet, PriceStalker relies on generic CSS patterns, which are sometimes less precise.
* **With AI**: If a store config is missing or incomplete, the system prunes the HTML and sends it to the configured AI provider. The AI automatically builds the exact CSS rules needed to track prices on that store in the future, saving them back into the database automatically.

### AI Price Cross-Verification
* If enabled, the AI engine double-checks the final price extracted by the system against the raw page layout. If the AI detects an error, it flags the product for human review instead of saving a wrong price.

---

## 5. Price Consensus & The Voting Modal
Sometimes, different elements on a page list different prices (e.g., a "Buy Now" price vs. "Save $10" deal tags). PriceStalker handles this gracefully:

* **Consensus Engine**: The system groups all extracted price candidates and tallies them up using a weighting scale. High-priority paths (like JSON-LD) carry more weight than generic HTML scans.
* **Out-of-Stock Guardrails**: If a product goes out of stock, PriceStalker applies safety rules (like checking if a price drifted down by more than 50% from the last known price) to avoid recording temporary glitches.
* **The Voting Modal (Human-in-the-Loop)**: If the system cannot resolve a clear winner, or if a price is suspicious, it halts and flags the product as `needsReview`. On the dashboard, a simple tab-based pill UI pops up, allowing you to select the correct price. The system then logs your choice and **learns** from it!

---

## 6. The Learning Loop
When you manually select the correct price in the Voting Modal (or when a scrape is successful), PriceStalker learns from it:
* It analyzes which rule successfully found that price.
* It promotes that rule to the top priority for that store.
* It tracks rule failure rates. If a rule fails too many times consecutively, it is automatically demoted or evicted.

---

## Related Documentation
* **Scraper Internals**:
 * [SCRAPER_LIFECYCLE.md](SCRAPER_LIFECYCLE.md) — Detailed technical stage-by-stage guide.
 * [product_lifecycle_slides.md](product_lifecycle_slides.md) — Visual flow diagram of the scraper pipeline.
 * [SELECTORS.md](SELECTORS.md) — In-depth guide on scraper selectors.
* **Administration & Setup**:
 * [beta/admin_guide.md](beta/admin_guide.md) — General administration and settings dashboard guide.
 * [beta/selectors.md](beta/selectors.md) — How to write custom CSS, XPath, and Regex selectors.
 * [beta/ai_features.md](beta/ai_features.md) — Configuring AI auto-mapping and verification.
 * [beta/tokens.md](beta/tokens.md) — Creating security credentials and API tokens.
 * [beta/system.md](beta/system.md) — Managing proxies, schedules, and circuit breakers.
 * [beta/admin_api.md](beta/admin_api.md) — Reference of secure HTTP endpoints for programmatic management.
 * [beta/user_notifications.md](beta/user_notifications.md) — How to configure notifications and customized alert types.
