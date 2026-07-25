# Working on PriceStalker

Guidance for anyone — human or AI — changing this repository. Claude Code and
most AI coding tools read this file automatically. Read it before your first
change.

For a 60-second overview of the directory layout and key backend paths, see the **[AI Agent Quick-Start](docs/AGENT_QUICKSTART.md)**.

Before searching the codebase or running discovery commands, check `CLAUDE.md`,
`docs/AGENT_QUICKSTART.md`, and `docs/SCRAPER_LIFECYCLE.md` first. Grepping the
entire codebase for answers that are already documented wastes time and misses
context.

PriceStalker is a self-hosted price tracker: a TypeScript/Express backend, a
React/Vite frontend, an optional stealth Puppeteer remote scraper (for JS-heavy
sites or retailers behind CDN/bot protection), and PostgreSQL.
It is a pnpm workspace (`backend`, `frontend`, `scraper`).

---

## The rules that matter most

These protect deliberate decisions. Breaking one silently undoes work that took
real effort to get right.

### 1. Do not reintroduce emoji into the UI

The interface uses a custom SVG icon set at
`frontend/src/components/Icon/Icon.tsx`. Emoji were deliberately removed from
every screen: they render differently per platform, ignore the theme, cannot
take a colour, and never align. **Do not add emoji to any `.tsx`/`.ts` file** —
not in JSX, not in strings, not as Unicode escapes (`'\u{1F514}'`), not in
`title`/`label`/placeholder text.

Need an icon? Use `<Icon name="..." />`. If none fits, add one to `Icon.tsx`
following the existing style (24×24 viewBox, stroke-based, `currentColor`) rather
than reaching for an emoji.

Typographic characters — `→ ← ↑ ↓ ↻` — are acceptable where they are genuine
text (a "Back" arrow, a sort indicator). Emoji are not.

This is enforced in CI: `pnpm run lint` (`scripts/check-no-emoji.mjs`) fails the
build on any emoji — literal or escaped — before anything is published. It runs
the same locally as in CI, so run it before committing frontend changes:

```bash
pnpm run lint
```

### 2. Locale and currency formatting must survive null

`users.locale` can be null. `Intl.NumberFormat(null, ...)` and
`Date#toLocaleDateString(null, ...)` **throw a TypeError**, and a throw during
render blanks the whole page. This exact bug shipped once.

Always format through `frontend/src/utils/format.ts` (`formatPrice`,
`formatDate`), which normalise null to undefined. Never call `Intl` or
`toLocale*` with a raw user-supplied locale.

### 3. Every route section stays inside an ErrorBoundary

`frontend/src/components/ErrorBoundary` exists because the app had none, so any
render error produced a blank white page with nothing to diagnose. New pages and
new tab sections must be wrapped in `<ErrorBoundary section="...">`. See the
product-detail page for the pattern.

### 4. Schema changes go through a migration — and migrations run at boot

Migrations live in `backend/src/migrations/NNN_name.ts` and are applied
automatically at startup by `backend/src/app/migrateOnBoot.ts`. There is no
manual "run the migrations" step in production.

- Number the next migration in sequence. Give it `up` and `down`.
- **Make it idempotent.** It may run against a fresh database, a database
  restored from `init.sql`, or one already partly migrated. Use
  `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, and existence guards.
- **Never edit a migration that has shipped.** Add a new one.
- Cast parameters when a placeholder is used both as an inserted value and in a
  `WHERE` — Postgres cannot always deduce the type, and it fails at runtime, not
  compile time (`inconsistent types deduced for parameter $N`).
- Test it against a throwaway Postgres before committing. `tsc` will not catch a
  bad query.

`001_baseline.ts` is **generated** by `database/v2-migration/generate-baseline.py`
— do not hand-edit it.

Reference data is not schema. Tables like `global_currencies` and
`regional_currency_mappings` are read by the app but written by nobody; their
rows must be seeded by a migration or a fresh install comes up with empty
dropdowns and broken currency inference. If you add a table the app reads from,
seed it.

---

## Architecture you should not fight

New features follow one of three patterns depending on what they are. Apply the
wrong one and the code will fight the rest of the system:

- **CRUD / data domain work** (users, products, retailers, settings): add a
  service in `backend/src/services/domain/<aggregate>/`, a repository under
  `.../repositories/`, and a thin Express route in `backend/src/routes/`. No SQL
  outside repositories. No business logic in routes.
- **Scraper pipeline work** (acquisition, extraction, arbitration): work inside
  `backend/src/services/scraper/` following the existing phase structure in
  `orchestration/`. Do not add scraper logic to domain services or routes.
- **Scheduled / background jobs**: add a task in
  `backend/src/services/scheduler/`. Do not trigger background work by calling
  services directly from routes.

Other rules that hold across all three:

- **Frontend is feature-sliced.** `frontend/src/features/<feature>/` holds its
  own `pages/`, `components/`, `services/`, `hooks/`. Shared UI lives in
  `frontend/src/components/`. Put new work in the right feature, not in a
  catch-all. `frontend/src/pages/` contains top-level route shells only —
  do not add business logic, hooks, or API calls there.
- **AI and notification channels use a provider pattern.** AI providers
  implement `AIProvider` (`services/ai/providers/types.ts`) and are registered
  in `services/ai/client.ts`. Notification providers are registered in
  `services/notifications/registry.ts`. Adding a new provider means creating a
  new file in the relevant `providers/` folder and adding one entry to the
  registry — not modifying existing providers.
- **`SettingsCache` has a 30-minute TTL.** Changes to `system_settings` in the
  database are not immediately visible to running code. If a settings change
  appears not to have taken effect, the cache has not expired yet — restart the
  backend or wait before concluding something is broken.
- **AI and auth config are instance-wide**, stored in the database and edited
  under **Admin**, not per user. SSO requires **both** `ENABLE_SSO=true` in the
  environment **and** the in-app Admin toggle — enabling one without the other
  intentionally does nothing.
- **Secrets are write-only over the API.** The auth-config endpoint returns
  `has_client_secret`, never the value. Preserve that pattern for any secret.
- **`axios` is pinned to exactly `1.14.0`** in every workspace. This is a hard
  upstream mandate — do not bump or use a range.

## Agent constraints

- **Never search high-volume directories.** Do not run `find`, `grep`, or `ls`
  against `node_modules`, `dist`, or `.git`. Always exclude them explicitly:
  `find backend/src -name "*.ts"` not `find . -name "*.ts"`. Use `-maxdepth 2`
  for any `find` at the project root.
- **Treat log files as streams.** The backend writes to `logs/backend.log` and
  `logs/error.log`. Always use `tail -n 100` or `grep` for specific keywords.
  Never `cat` a full log file.
- **Verify before acting on docs.** Plans, audit reports, and markdown files may
  be stale. Before acting on anything in `docs/` that seems inconsistent — check
  the actual source file or running code first. Correct stale docs as part of the
  task.
- **Read large files in ranges.** `docs/SCRAPER_AUDIT.md` (136KB) and
  `backend/src/migrations/001_baseline.ts` are known large files. Check file
  size before opening any file. Never read more than needed — use line ranges or
  `grep` for targeted lookups.
- **Do not log credentials raw.** The logger (`backend/src/utils/system/logging/
  scrubber.ts`) auto-redacts passwords, tokens, and API keys. Never use
  `console.log` for anything containing user data or secrets. Never bypass the
  logger to work around scrubbing.
- **No `as any` or `// @ts-ignore`.** Fix the type error — do not suppress it.
  If a third-party type definition is wrong, use a minimal local override rather
  than widening to `any`. TypeScript strict mode is on; escape hatches hide real
  bugs.

## Understanding the scraper

Before changing anything in `backend/src/services/scraper/`, read
[docs/SCRAPER_LIFECYCLE.md](docs/SCRAPER_LIFECYCLE.md) (the 6-phase pipeline) and
[docs/beta/selectors.md](docs/beta/selectors.md) (the selector DSL). The engine is subtle —
consensus weighting, out-of-stock price nullification, and AI auto-mapping all
interact. Guessing at it is how extraction bugs get introduced.

The AI auto-mapping flow (Phase 4) and the Voting Modal are how PriceStalker
*learns* retailer configurations from real scrape results. Do not short-circuit,
skip, or cache-bust these flows when debugging extraction issues. If a scrape
looks wrong, check the `retailer_configs` table in the database for the
domain's selector config and `system_logs` for recent scrape trace history first.

### Debugging scraper HTML

Scraper HTML pages are often large and frequently arrive as a **single line with
no whitespace or line breaks** (minified). Do not attempt to read them directly.

- **Detect minification first.** If a fetched HTML file appears to be one
  massive single line, break it before searching:
  ```bash
  # Insert a newline after every closing tag
  sed 's/>/>\'$'\n/g' /path/to/dump.html > /tmp/broken.html
  # or
  tr '>' '\n' < /path/to/dump.html > /tmp/broken.html
  ```
- **Redirect dumps, never print.** Always write raw HTML to a temp file rather
  than outputting to the console:
  ```bash
  # The backend writes debug HTML here inside the container:
  # /app/backend/debug_html/<domain>_<timestamp>.html
  ```
- **Use targeted grep with small windows.** Pipe through `head` to prevent token
  spikes:
  ```bash
  grep -E -i 'itemprop="price"|data-testid.*price|class=".*price' /tmp/broken.html -C 2 | head -c 2000
  ```
- **Focus on high-signal attributes** rather than generic text searches:
  `itemprop="price"`, `data-testid`, `data-price`, `class="*price*"`,
  `application/ld+json`.

---

## Commands

```bash
pnpm install --frozen-lockfile    # install all workspaces

# backend
pnpm --filter pricestalker-backend run build  # tsc (NOT a bundler — see below)
pnpm --filter pricestalker-backend test       # vitest
pnpm --filter pricestalker-backend run db:migrate:dev  # run migrations against $DATABASE_URL

# frontend
pnpm --filter pricestalker-frontend run build  # vite build (also typechecks)
pnpm --filter pricestalker-frontend run dev    # dev server

# full clean install + verification suite
make verify
```

The backend image compiles with `tsc`, **not** `build:bundle`. Migrations are
globbed as `dist/migrations/*.js` at runtime; a bundler collapses them into one
file and none are found. Do not change the backend build to bundle.

---

## Before you commit

- `pnpm --filter pricestalker-frontend run build` — passes, and typechecks.
- `pnpm --filter pricestalker-backend test` and `pnpm --filter pricestalker-backend run build` — pass.
- `pnpm run lint` (the emoji check, rule 1) passes.
- New migrations tested against a real Postgres, not just `tsc`.
- Verify against the **built bundle / running app**, not only the source. Three
  separate bugs here were invisible in source and only showed up in the compiled
  output or against real data (escaped emoji, null locale, unseeded reference
  tables).
- Update `CHANGELOG.md` for any user-facing change. Add an entry under
  `## [Unreleased]` using `### Added`, `### Fixed`, or `### Changed`. The file
  follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — match the
  existing format exactly.

## Deployment context

Images build in GitHub Actions and publish to GHCR. `main` publishes the `:beta`
tag, which production tracks. Production runs on Docker Swarm; the schema
migrates one-way on deploy, so **a database backup precedes any production
deploy**. See `deploy/swarm-stack.yml` and `CHANGELOG.md`.

## Things that are intentionally the way they are

- Emoji removed in favour of the icon set (rule 1).
- The database is named `priceghost`, not `pricestalker` — renaming it would
  orphan existing data. See `deploy/swarm-stack.yml`.
- `product_groups`, `site_configs`, `user_memberships` tables exist but are
  unused by current code. Leave them; do not build against them without checking
  first.
- OpenRouter, the daily update-check, per-product currency override and
  notify-on-any-change were dropped from 1.x. Do not "restore" them without
  asking — their absence is deliberate.
