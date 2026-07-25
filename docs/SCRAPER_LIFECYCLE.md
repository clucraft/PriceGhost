# PriceStalker Product Scraper Lifecycle

This document is the canonical reference for how PriceStalker processes a product from initial URL submission through to scheduled monitoring. It supersedes all older flow diagrams (see `old_docs/`).

> For the visual end-to-end diagram, see [product_lifecycle_slides.md](product_lifecycle_slides.md). 

> For the extraction system internals, see [SELECTORS.md](SELECTORS.md). 
> For the consensus weighting table and arbitration audit, see the upstream audit register (not yet imported).

---

## Pipeline Overview

`scrapeProductWithVoting()` in `orchestration/index.ts` executes **six sequential phases**:

```
Phase 0: initScrapeSession → Load domain config, AI settings, currency/locale hints
Phase 1: acquireHtml → HTTP fetch (axios) → remote Puppeteer browser fallback (the remotescraper service)
Phase 2: runExtractionPhase → DOM denoise → metadata (stock/title/image) → price candidates
Phase 3: Validation → handleRetailerMaintenance (bot/maintenance detection)
Phase 4: handleAutoMapping → AI auto-generates retailer config if none exists
Phase 5: runConsensusPhase → findPriceConsensus → weighted arbitration → OOS guardrails
Phase 6: runVerificationPhase → Optional AI cross-verification of selected price
 → Result returned to caller (ProductRefreshService / ProductDiscoveryService)
```

---

## Phase 0 — Session Initialisation

**File:** `orchestration/init.ts`

- Loads `retailer_configs` row by domain (via `getUrlLookup` canonical key — strips `www.`, trailing slashes, lowercases).
- Loads global AI settings, proxy configuration, and currency/locale hints from `settingsCache`.
- Sets `finalSkipAiExtraction` flag based on config and global settings.

---

## Phase 1 — HTML Acquisition

**File:** `orchestration/acquisition.ts`

1. **Standard Axios fetch** — Uses configured headers, optional proxy, and circuit-breaker backoff.
2. **Soft-404 detection** — Checks for redirect-to-homepage, title-mismatch, robots.txt exclusion.
3. **Bot-challenge detection** — Flags Imperva/Cloudflare challenge responses.
4. **Remote Puppeteer fallback** (the `scraper` service) — If standard request fails or `use_browser_scraper=true`, renders via stealth browser. On success, sets `use_browser_scraper=true` in config for future runs.

> **When to use the browser scraper:** Enable `use_browser_scraper` per-retailer (Admin > Retailer Settings) for sites that:
> - Require JavaScript execution to render prices (React/Vue SPAs, lazy-loaded price elements)
> - Are behind CDN bot-protection such as Cloudflare or Imperva that blocks plain HTTP requests
> - Return incomplete or challenge HTML to standard `axios` fetches
>
> The `Remote Scraper URL` system setting (Admin > Settings) must point to the running `scraper` container before per-retailer flags take effect.

> **URL cleaning:** `cleanUrl()` in `urlHelper.ts` strips UTM/affiliate/tracking parameters before lookup and storage. 
> **Known quirk:** The hash-stripping logic uses `.includes(k)` against KEEP_LIST, meaning single-char entries like `'v'` match fragments like `#reviews` — documented in `url-helper.test.ts`. upstream audit issue **U-1**.

---

## Phase 2 — Data Extraction

**Files:** `orchestration/extraction.ts`, `extractors/`

Runs in this order:

1. **DOM Denoiser** — `denoiseDomForExtraction()` strips `<script>`, `<style>`, `<noscript>`, `<footer>`, `<nav>`, `<header>`, `<aside>` etc. from the Cheerio DOM. Preserves nodes matching any retailer price/stock/name selector to avoid destroying evidence.
2. **Metadata extraction** — Name, image, stock status (see Stock Extraction below).
3. **Price candidate collection** — Seven-layer cascade (see Price Extraction below).

### Stock Extraction Order

| # | Method | Confidence | File |
|---|--------|-----------|------|
| 1 | Pre-order price selectors (`pre_order_price_selectors`) | Implicit high | `stock/pre-order.ts` |
| 2 | Custom stock selectors (`stock_selectors`) | 0.95 | `stock/custom.ts` |
| 3 | Schema.org `[itemprop="availability"]` | 0.90 | `stock/schema.ts` |
| 3b | Global system stock selectors | 0.85 | `stock/custom.ts` |
| 4 | Generic phrase matching (`main`, fallback `body`) | 0.50 | `stock/generic.ts` |

Winner = highest-confidence candidate where `value !== 'unknown'`.

### Price Extraction Cascade

| # | Method | Confidence | Weight |
|---|--------|-----------|--------|
| 1 | JSON-LD (`extractJsonLdCandidates`) | 0.95 | 2.0 |
| 2 | Deal price selectors | 0.95 | 1.0* |
| 3 | Member price selectors | 0.95 | 1.0* |
| 4 | Pre-order price selectors | 0.95 | 1.0* |
| 5 | Original price selectors | 0.95 | 1.0* |
| 6 | Custom CSS selectors | 0.90 | 1.5 |
| 7 | Generic CSS selectors (capped at 40 candidates) | 0.60 | 0.2 |

\* Deal/member/pre-order/original candidates bypass the weight system via short-circuit in `findPriceConsensus` (see Phase 5).

---

## Phase 3 — Bot/Maintenance Validation

**File:** `orchestration/maintenance.ts`

- Checks for known bot-challenge patterns in the fetched HTML.
- Flags `retailer_config.is_blocked = true` if site is under maintenance.
- **Success-first logic:** If Phase 2 returned valid price data despite a partial bot challenge, the challenge is ignored.

---

## Phase 4 — AI Auto-Mapping

**File:** `orchestration/auto-mapping.ts`

Triggers when no retailer config exists (or `isShellConfig = true`) AND `ai_auto_mapping_enabled = true`:

1. **DOM Pruner** — `cleanHtml()` strips boilerplate to fit within the lightweight AI context window (typically ≤50 KB).
2. **Config Generation** — Sends pruned HTML + meta tags to the active AI provider (`RETAILER_GENERATION_PROMPT`).
3. **Config Save** — Saves generated CSS selectors to `retailer_configs`.
4. **Re-Scrape** — Full extraction re-runs with the new config.

> `isShellConfig` currently does NOT include `pre_order_price_selectors` or `original_price_selectors` in its guard check — a config with only those fields set would trigger unnecessary AI mapping. upstream audit issue **X-2**.

---

## Phase 5 — Price Consensus & OOS Guardrails

**Files:** `arbitrators/consensus.ts`, `orchestration/consensus.ts`

### Consensus Algorithm

`findPriceConsensus(candidates)` uses a **two-stage hybrid** approach:

**Stage A — Method short-circuit (highest structural priority):**

1. Deal prices (`deal-price`) → if ≥2 candidates agree → immediate consensus, skip weight phase.
2. Member prices (`member-price`) → same.
3. Pre-order prices (`pre-order-price`) → same.
4. Original prices (`original-price`) → same.
5. If any stage produces a tie → `hasConsensus = false`, flag `needsReview = true`.

**Stage B — Weighted arbitration (fallback):**

Candidates are grouped by source key (method + selector). Each group accumulates `weight × count`. The highest-scoring group wins. Weights:

| Method | Weight |
|--------|--------|
| `expert-*` | 5.0 |
| `json-ld` | 2.0 |
| `custom-regex` | 1.6 |
| `custom-css` | 1.5 |
| `generic-css` | 0.2 |
| All others | 1.0 |

Tie-breaking within a group: highest confidence → lowest price ( see audit issue **C-3**).

### OOS Guardrails (`runConsensusPhase`)

After `findPriceConsensus` resolves a price, additional checks apply **only when the product is out of stock:**

| Check | Condition | Action |
|-------|-----------|--------|
| Single-source isolation | Only 1 JSON-LD candidate, no corroboration | Nullify price, `needsReview = true` |
| Low-confidence generic | Score < 0.85 and method is generic | Nullify price, `needsReview = true` |
| Anchor drift | Price < 50% of anchor (last known price) | Nullify price, `needsReview = true` |

`highConfidenceMethods` whitelist (retains OOS price): `['custom-css', 'custom-regex', 'deal-price', 'member-price', 'pre-order-price', 'original-price']` plus any `expert-*` prefix.

---

## Phase 6 — AI Verification

**File:** `orchestration/verification.ts`

If `ai_verification_enabled = true` and a price was resolved:

- Sends the resolved price candidate + denoised HTML to the active AI provider for cross-check.
- If the AI disagrees → `needsReview = true`, `aiStatus = 'corrected'`.
- If the AI agrees → `aiStatus = 'verified'`.

---

## Voting Modal Flow

When `needsReview = true`, the API response includes a `PriceReviewResponse` blob:

```
POST /api/products (new product add)
 └─ productDiscoveryService.initiateProductDiscovery()
 └─ if needsReview=true → returns PriceReviewResponse (nothing written to DB yet)
 └─ Frontend shows PriceSelectionModal
 └─ User confirms → POST /api/products (with selectedPrice + selectedMethod)

POST /api/products/:id/scan (re-scan existing product)
 └─ productRescanService.scanProduct()
 └─ ALWAYS returns PriceReviewResponse + full voting blob
 └─ Frontend shows PriceSelectionModal
 └─ User confirms → POST /api/products/:id/confirm
 └─ confirmation.ts → saveScrapeResult('manual-confirm')
 → runAutoRetailerConfig() → promotes selector to priority 0 in DB
 → productRepository.update({ needs_price_review: false, ai_status: 'confirmed' })
```

### Candidate Enrichment

Before returning to the client, `memberPrice` and `originalPrice` top-level fields are injected as typed `PriceCandidate` entries into `priceCandidates[]`:

- `method: 'member-price'`, `context: 'Member / loyalty price'`
- `method: 'original-price'`, `context: 'Original / RRP price'`

This gives the frontend a unified candidate list for the modal's tab-based pill UI.

---

## Scheduler & Refresh Monitoring

**Files:** `ProductRefreshService.ts`, `SchedulerService.ts`

- Cron job runs on configurable interval (default every 12 hours per product, based on `refresh_interval`).
- Triggers `scrapeProductWithVoting()` for each active, non-paused product.
- On success: `saveScrapeResult('refresh')` → price history, stock history, notifications if price changed.
- On persistent 404/410: `checking_paused = true`, stock set to `not_available`, user alerted.
- On transient error (503, timeout): exponential backoff, retry in next scheduler cycle.
- On `needsReview = true` from refresh: `products.needs_price_review = true` is written to DB (as of v1.0.55), surfacing the product in the review queue.

---

## Auto-Config Learning Loop

After a successful scrape (or user confirmation via the Voting Modal), `runAutoRetailerConfig()` updates `retailer_configs`:

1. **`resolveWinningSelector()`** — Finds the candidate whose price matches the saved price and whose method is in the allowed whitelist (`custom-css`, `deal-price`, `member-price`, `pre-order-price`, `original-price`, `custom-regex`).
2. **Selector promotion** — Winning selector is `unshift`ed to index 0 of the relevant selector array in `retailer_configs`.
3. **Staleness tracking** — `selector_metadata.selectors[selector]` is updated: `match_count++`, `consecutive_failures = 0`, `last_matched_at = now()`. Other custom selectors in the array receive `consecutive_failures++`.
4. **Score-based eviction** — If any selector array exceeds 10 entries, the lowest-scoring selectors are evicted. Score = `match_count - (consecutive_failures × 2)`.
5. **Generic selector cleaning** — `cleanSelectorArray()` removes any generic/global selectors that are now in the domain-specific array to prevent redundancy.
6. **Cache invalidation** — `configCache.invalidate(domain)` fires after the DB upsert commits.

> `runAutoRetailerConfig` currently runs **outside** the outer persistence transaction — a partial-failure risk. upstream audit issue **V-1** (FIXED in v1.8.2).

---

## Key Data Stores

| Table | Purpose |
|-------|---------|
| `products` | Core product row: URL, `needs_price_review`, `checking_paused`, `ai_status` |
| `price_history` | Append-only log of all price changes per product |
| `stock_status_history` | Append-only log of all stock status changes |
| `retailer_configs` | Domain-keyed scraping configs: selectors, `selector_metadata`, booleans |
| `system_logs` | Structured scrape/notification logs (14-day retention) |
| `exchange_rates` | Daily FX rates updated at 4 AM via cron |

---

## Related Documentation

- [SELECTORS.md](SELECTORS.md) — Selector format reference (CSS, Scrapy `::attr`, regex `~pattern~`, modifiers)
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) — Developer setup, Vitest suites, and local execution workflows
- [PROCESSES.md](PROCESSES.md) — Deployment, backup, and operational runbooks
- the upstream audit register (not yet imported) — Full backend audit with issue register and fix status
