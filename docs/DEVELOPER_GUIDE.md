# PriceStalker Developer Guide

This document describes the codebase architecture, development workspace setup, unit testing, and debugging workflows when modifying the PriceStalker application.

---

## 1. Project Directory Structure

PriceStalker V2 utilizes a monorepo workspace managed with pnpm, separating components into distinct backend, frontend, and utility sub-projects.

```
├── backend/
│   ├── src/
│   │   ├── app/            # Application bootstrappers (migrations, cron loops)
│   │   ├── migrations/     # Idempotent DB schema changes
│   │   ├── routes/         # Express endpoint controllers
│   │   ├── services/       
│   │   │   ├── domain/     # Core DDD layers (Aggregate services & repositories)
│   │   │   └── scraper/    # Scraper transport, extraction cascade, & AI logic
│   │   └── utils/          # Universal helpers (price parser, cache invalidator)
│   └── tests/
│       ├── fixtures/       # Mock HTML files for extraction validation
│       └── unit/           # Backend Vitest suite
├── frontend/
│   ├── src/
│   │   ├── components/     # Globally shared UI components (Icons, Spinners)
│   │   ├── features/       # Feature-sliced aggregates (admin, products, auth)
│   │   │   └── <feature>/  # Each feature folder bundles its pages, hooks, & services
│   │   └── utils/          # Null-safe locale and date formatters
├── scraper/                # Optional stealth Chromium container (Puppeteer) for JS-heavy sites
│                           #   or retailers behind CDN/bot protection (e.g. Cloudflare, Imperva).
│                           #   Enabled per-retailer via the Admin UI. Requires `Remote Scraper URL`
│                           #   to be configured in Admin > Settings.
├── deploy/                 # Docker Swarm configuration stack templates
├── Makefile                # Unified project runner commands (make up, make verify)
├── .env.example            # Baseline environment configurations
└── docker-compose.yml      # Multi-container local orchestration
```

---

## 2. Development Setup & Workflows

### Prerequisites
* **Node.js**: Version 24.x (at least 24.18)
* **pnpm**: Version 11.x (at least 11.4)
* **Docker**: With Compose v2 plugin
* **Build tool**: `make` (POSIX shell required)
* *Volta is recommended to automatically lock Node and pnpm to verified development versions.*

### Running via Local Docker Stack
The Makefile compiles the code into local container images and spins up PostgreSQL, the backend API, and the React frontend.

```bash
# Clone and setup node modules
git clone https://github.com/mikeknight85/PriceStalker.git
cd PriceStalker
pnpm install --frozen-lockfile
make check-tools                 # verify system prerequisites

# Copy default configurations and run the stack
cp .env.example .env
# Open .env and set non-placeholder POSTGRES_PASSWORD and JWT_SECRET
make up
```
The web UI is accessible at `http://localhost:8080` by default.

### Container Helper Commands
Use these commands to manage your local container stack:
* **`make status`**: View container status and port mappings.
* **`make logs`**: Stream all container logs.
* **`make logs-backend`**: Stream logs for the backend container only.
* **`make up-scraper`**: Start the stack including the optional browser scraper.
* **`make down`**: Stop and remove active containers (preserves database volumes).

### Building with Custom Registries
For organization repositories, forks, or private registry deployments, configure custom registry targets:
```bash
make IMAGE_REGISTRY=ghcr.io IMAGE_NAMESPACE=your-username up
```

### Manual Hot-Reload Workflow
Use this flow if you have a local PostgreSQL instance running natively on your host machine and want to edit and test without containers.

1. Configure `DATABASE_URL` and `JWT_SECRET` in your environment or in a local `.env` file.
2. Run backend migrations and start the hot-reloading backend server:
   ```bash
   pnpm --filter pricestalker-backend run db:migrate:dev
   pnpm --filter pricestalker-backend run dev
   ```
3. In a second terminal window, start the frontend Vite development server:
   ```bash
   pnpm --filter pricestalker-frontend run dev
   ```
The frontend is served at `http://localhost:5173`, proxying `/api` requests to the backend API running at `http://localhost:3001`.

---

## 3. Unit Testing with Vitest

For testing parsers, CSS selectors, extraction pipelines, and database model helper updates without external web scraping dependencies, use **Vitest**.

```bash
# Run all backend unit tests in the suite
pnpm --filter pricestalker-backend test

# Run a specific unit test file
pnpm --filter pricestalker-backend exec vitest run tests/unit/price-extraction.test.ts

# Run tests in watch mode for active iteration
pnpm --filter pricestalker-backend exec vitest tests/unit/price-extraction.test.ts
```

### Mocking with HTML Fixtures
Do not run live scrapes during unit tests. Instead, capture raw web pages:
1. Save raw page HTML files inside the `backend/tests/fixtures/` directory.
2. Read the local fixture file in your test suite to run parser checks.

---

## 4. Live Scraper Debugging & Tracing

You can trigger live scraper trace runs without committing database changes using the debug endpoint.

* **Endpoint**: `POST /api/admin/debug/extract`
* **Payload**:
  ```json
  {
    "url": "https://www.example.com/product",
    "mode": "scraper",
    "config": {
      "use_browser_scraper": false
    },
    "use_ai": true,
    "returnHtml": false
  }
  ```
  * Set `mode` to `"bypass"` to execute a raw Axios HTTP request.
  * Set `mode` to `"scraper"` to run the headless browser scraper.
  * Set `returnHtml: true` to return the complete fetched DOM structure in the response payload.
* **HTML Page Dumps**: Every debug extraction writes a raw HTML file copy to `/app/backend/debug_html/` inside the container. You can inspect this file to verify exactly what DOM structure the parser evaluated.

---

## 5. Development Code Rules

These rules protect deliberate architecture designs. Breaking them will fail local validations and CI workflows:

* **No Emojis**: Emojis are strictly banned from UI JSX and backend files to prevent rendering layout and theme inconsistencies. Enforced via `pnpm run lint`. Use `<Icon name="..." />` instead.
* **Null-Safe Formatters**: Never call browser `Intl` or `toLocale*` formatters directly with raw user locale values, as `users.locale` can be `null` and will crash rendering. Use the wrapper formatters inside `frontend/src/utils/format.ts` (`formatPrice`, `formatDate`).
* **Error Boundaries**: Every page-level layout and tab section must be wrapped in a `<ErrorBoundary>` component.
* **Idempotent Migrations**: Database migrations under `backend/src/migrations/` must be idempotent. Do not hand-edit shipped migrations; create a new numbered migration instead.
* **No Backend Bundling**: The backend compiles with `tsc` to maintain individual output files under `dist/migrations/` so the bootstrapper can glob them dynamically. Do not bundle backend code.
* **Domain Service Architecture**: SQL query layers must stay within repositories (`backend/src/services/domain/<aggregate>/repositories/`), not in Express routes or service files.
* **Pin Dependencies**: `axios` is pinned to exactly `1.14.0` in all workspaces and must not be bumped.

---

## 6. Frontend Component Context Patterns

When splitting a large page into modular sub-components, follow these conventions
to preserve structural context for future developers and AI agents navigating the
codebase. These are recommended conventions — not yet enforced by tooling.

### Sub-component JSDoc Header

Every sub-component file should start with a context block linking it back to
its parent shell and CSS:

```typescript
/**
 * @component ComponentName
 * @parentShell ParentName (path/to/parent/index.tsx)
 * @stylesheet StylesheetName (path/to/parent/ParentName.css)
 * @stateOwner [Parent|Self|Context] (Which component owns and manages the state)
 */
```

### Visual State Tree (Parent Shell)

The main page controller (`index.tsx`) should contain an ASCII tree showing the
component hierarchy and state bindings, so the ownership model is visible at a
glance without reading every child file:

```typescript
/**
 * ParentShell (state: { activeItem, isLoading })
 * ├── SubComponentHeader (read-only: activeItem)
 * ├── SubComponentForm (callbacks: onSubmit)
 * └── SubComponentFooter (read-only: isLoading)
 */
```

> [!TIP]
> Apply these patterns when breaking apart a component that has grown past ~200
> lines or has more than 3–4 child sub-components. They are most valuable in
> feature-heavy pages like product detail and admin settings.

---

## 7. Related Developer Documentation

* **[CLAUDE.md](../CLAUDE.md)**: Developer quick-start cheat sheet for building, linting, and formatting.
* **[CONTRIBUTING.md](../CONTRIBUTING.md)**: Workspace setup, package manager guidelines (`pnpm`), and development container workflows.
* **[docs/SCRAPER_LIFECYCLE.md](SCRAPER_LIFECYCLE.md)**: In-depth technical breakdown of the 6-phase scrape lifecycle.
* **[docs/SELECTORS.md](SELECTORS.md)**: Details on the unified selectors engine syntax, xpath, and regex.
* **[docs/DATABASE.md](DATABASE.md)**: Information on tables, schema design, and pg_notify cache invalidations.
* **[docs/I18N_DESIGN.md](I18N_DESIGN.md)**: Guidelines for localizing UI labels and managing translation key JSON files.
* **[docs/SSO_DESIGN.md](SSO_DESIGN.md)**: Configuration details for OpenID Connect (OIDC) Single Sign-On providers and JWT authentications.
* **[docs/DESIGN_TOKENS.md](DESIGN_TOKENS.md)**: Developer styling guide mapping global CSS colors, shadows, and spacing tokens.

