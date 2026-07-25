# PriceStalker — AI Agent Quick-Start

This file provides a 60-second orientation and architectural rules for AI coding assistants (such as Cursor, Gemini, ChatGPT, or GitHub Copilot) working on the PriceStalker codebase.

---

## 1. Directory Structure & Key Files

| Component / Utility | Directory / File Path |
| :--- | :--- |
| **Backend Source** | `backend/src/` |
| **Frontend Source** | `frontend/src/` |
| **Stealth Browser Scraper** | `scraper/` |
| **Developer Workflows** | [docs/DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) |
| **Scraper Lifecycle** | [docs/SCRAPER_LIFECYCLE.md](docs/SCRAPER_LIFECYCLE.md) |
| **Database Schema Details** | [docs/DATABASE.md](DATABASE.md) |
| **Unified Selectors Guide** | [docs/beta/selectors.md](beta/selectors.md) |

---

## 2. Core Code Mandates & Constraints

These are strict rules to protect deliberate architecture designs. Breaking them will fail local validations and CI/CD pipelines:

### 🚫 1. Absolute ban on Emojis in code and UI
The interface uses a custom SVG icon set (`frontend/src/components/Icon/Icon.tsx`). **Do not add emoji characters or unicode emoji escapes to any `.tsx`/`.ts` files**.
* *Verification*: Running `pnpm run lint` executes a pre-commit check (`scripts/check-no-emoji.mjs`) that will fail if any emojis are found.

### 🌐 2. Null-Safe Locale and Date Formatting
User locales can be `null`, which causes browser `Intl` and `toLocaleDateString` formatters to throw fatal TypeError exceptions during rendering.
* *Rule*: Never call formatting functions directly with user settings. Use formatting helpers inside `frontend/src/utils/format.ts` (`formatPrice`, `formatDate`), which safely normalize nulls.

### 🛡️ 3. Wrap Layouts in Error Boundaries
All new page routes or main tab sections must be wrapped inside a `<ErrorBoundary>` component to prevent rendering exceptions from blanking out the entire web application.

### 📦 4. No Backend Bundling
The backend must compile strictly using TypeScript (`tsc`) to preserve individual JavaScript files inside `dist/migrations/` so the bootstrapper can glob and run migrations. Do not bundle backend code.

### 💾 5. Domain Service Repository Patterns
SQL database logic must reside exclusively inside repositories (e.g. `backend/src/services/domain/<aggregate>/repositories/`), keeping Express routes and domain service files thin.

---

## 3. Recommended Developer Commands

Always run these commands to verify code changes before committing:

```bash
# 1. Run all backend unit tests via Vitest
pnpm --filter pricestalker-backend test

# 2. Run tests for a specific file
pnpm --filter pricestalker-backend exec vitest run tests/unit/price-extraction.test.ts

# 3. Compile and typecheck the React frontend
pnpm --filter pricestalker-frontend run build

# 4. Run the code linter and emoji check
pnpm run lint

# 5. Run the complete clean installation and verification suite
make verify
```
