<p align="center">
  <img src="assets/header.svg" alt="PriceGhost" width="580">
</p>

<p align="center">
  <strong>A self-hosted price tracking application that monitors product prices from any website.</strong><br>
  Get notified when prices drop, hit your target price, or items come back in stock.
</p>

<p align="center">
  <img width="1332" height="1108" alt="image" src="https://github.com/user-attachments/assets/6b75f889-06d7-41b3-bc0a-145b132109fd" />
</p>

---

## You Choose the Price. Always.

**Unlike other price trackers that silently pick a price and hope it's right**, PriceGhost uses a multi-strategy extraction system with a unique **Price Voting Modal** that puts you in control.

### How It Works

When you add a product, PriceGhost runs **four independent extraction methods** in parallel:

| Method | How It Works | Reliability |
|--------|--------------|-------------|
| **JSON-LD** | Reads schema.org structured data embedded by the retailer | Highest |
| **Site-Specific** | Custom-tuned scrapers for major retailers (Amazon, Best Buy, Walmart, etc.) | High |
| **Generic CSS** | Intelligent CSS selectors that find price patterns | Medium |
| **AI Analysis** | Claude/GPT/Ollama analyzes the page context | High |

Each method "votes" on what it thinks the price is. If they agree, you're good to go. If they disagree, **you see all the candidates and make the final call**.

### The Price Selection Modal

<p align="center">
  <em>Multiple prices found? No problem. You decide which one is correct.</em>
</p>

The modal shows you:
- **Every price candidate** found by each extraction method
- **Confidence scores** so you know which ones are most reliable
- **Context** explaining where each price was found (e.g., "Structured Data", "Site Scraper", "AI Extraction")
- **The product image and name** so you can verify you're tracking the right item

This means:
- No more accidentally tracking a "Save $200" discount amount instead of the actual price
- No more confusion between monthly payment plans ($49/mo) and the real price ($1,999)
- No more tracking bundle prices when you wanted the single item
- **You always know exactly what price you're tracking**

This feature doesn't exist in Keepa, CamelCamelCamel, Honey, or any other price tracker we've seen. They guess. You choose.

---

## Built by AI. Built Right.

This entire application was developed collaboratively with [Claude](https://claude.ai) (Anthropic's AI assistant) using [Claude Code](https://claude.ai/claude-code). Every feature, from database migrations to responsive UI components, was crafted through iterative conversation and careful code generation.

**This is not "AI slop."** This is a fully functional, production-ready application with:
- Proper error handling throughout
- Clean, maintainable TypeScript codebase
- Real security practices (JWT auth, bcrypt hashing, input validation)
- Thoughtful UX with toast notifications, loading states, and responsive design
- Comprehensive API with consistent patterns

Built with Claude Opus 4.5.

---

## Strongly Recommended: Enable AI Features

While PriceGhost includes multiple scraping strategies (JSON-LD, meta tags, CSS selectors, pattern matching, and headless browser), **we highly recommend enabling AI-powered features** for the best results.

Modern e-commerce sites use increasingly complex layouts, dynamic pricing, and anti-scraping measures. AI can understand page context and reliably extract prices even from difficult sites.

### AI Extraction (Fallback)
When standard scraping fails to find a price, AI extraction kicks in as a fallback.

### AI Verification (Recommended)
Verifies every scraped price to ensure accuracy. This catches issues like accidentally scraping a "savings" amount ($189.99 off) instead of the actual product price ($675.59).

### AI Arbitration
When multiple extraction methods disagree, AI can analyze all candidates and recommend the correct one - which you can then confirm or override in the Price Selection Modal.

**To enable:**
1. Get an API key from [Anthropic](https://console.anthropic.com) (Claude), [OpenAI](https://platform.openai.com), or install [Ollama](https://ollama.ai) locally (free)
2. Go to Settings > AI Extraction
3. Enable **AI Extraction** (fallback) and/or **AI Verification** (recommended)
4. Select your provider and enter your API key (or Ollama URL)

The cost is minimal (fractions of a cent per API call with Claude Haiku/GPT-4o-mini). Ollama is completely free but requires local compute.

---

## Features

### Multi-Strategy Price Extraction
- **4 extraction methods** - JSON-LD, site-specific scrapers, generic CSS, and AI work together
- **Price voting system** - Methods vote on the correct price; consensus = automatic, disagreement = you choose
- **Price Selection Modal** - See all price candidates with confidence scores and context
- **AI arbitration** - When methods disagree, AI helps recommend the right price
- **Headless browser support** - Puppeteer with stealth mode for JavaScript-heavy sites (Best Buy, Target, Walmart, etc.)

### Price Tracking
- **Universal scraping** - Works with virtually any e-commerce website
- **AI-powered fallback** - Optional Claude, GPT, or Ollama (local) integration for difficult-to-scrape sites
- **AI price verification** - Verify scraped prices with AI to catch extraction errors
- **Price history charts** - Interactive visualization with customizable date ranges (7d, 30d, 90d, all time)
- **7-day sparklines** - Quick price trend overview on the dashboard
- **Configurable check intervals** - From 5 minutes to 24 hours per product
- **Live countdown timers** - See exactly when each product will be checked next
- **Progress bar visualization** - Animated gradient progress bars showing time until next check

### Notifications
- **Price drop alerts** - Set a threshold (e.g., "notify when it drops $10+")
- **Target price alerts** - Set your ideal price and get notified when reached
- **Back-in-stock alerts** - Get notified when out-of-stock items become available
- **Telegram** - Get alerts via Telegram bot
- **Discord** - Send alerts to any Discord channel via webhooks
- **Pushover** - Native Pushover support for mobile push notifications
- **ntfy.sh** - Simple, no-account push notifications to any device
- **Per-channel toggles** - Enable/disable each notification channel independently
- **Test notifications** - Send test alerts to verify your setup

### Stock Tracking
- **Out-of-stock detection** - Automatically detects when products are unavailable
- **Visual indicators** - Clear badges showing stock status on dashboard and detail pages
- **Stock change notifications** - Get notified when items come back in stock

### User Experience
- **PWA Support** - Support for installing on mobile through "Add to Home Screen"
- **Dark/Light mode** - Automatic system theme detection with manual toggle
- **Toast notifications** - Visual feedback for all actions
- **Responsive design** - Works on desktop and mobile
- **Manual refresh** - Force an immediate price check with one click
- **Price statistics** - See min, max, and average prices for each product
- **Real-time countdowns** - Animated progress bars and timers for each product

### User Management
- **Multi-user support** - Each user has their own products and settings
- **Admin panel** - Manage users, create accounts, toggle admin privileges
- **Registration control** - Enable/disable public registration
- **Profile management** - Update display name and change password

## Supported Retailers

PriceGhost has **site-specific scrapers** optimized for:

| Retailer | Browser Rendering | Notes |
|----------|-------------------|-------|
| Amazon (.com, .co.uk, .de, etc.) | No | Full support including deal prices |
| Best Buy | Yes | Filters out financing/payment plans |
| Walmart | Yes | Reads __NEXT_DATA__ for prices |
| Target | Yes | Full support |
| Costco | Yes | Full support |
| eBay | No | Auction and Buy It Now prices |
| Newegg | No | Handles combo deals correctly |
| Home Depot | No | Full support |
| AliExpress | No | Full support |
| Magento 2 stores | No | Any store using Magento 2 |

**Any other site** works via generic extraction + AI fallback.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL |
| **Scraping** | Cheerio, Puppeteer (with stealth plugin) |
| **AI Extraction** | Anthropic Claude, OpenAI GPT, Ollama (optional but recommended) |
| **Charts** | Recharts |
| **Auth** | JWT + bcrypt |
| **Scheduling** | node-cron |

## Quick Start

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/clucraft/PriceGhost.git
cd PriceGhost

# Start all services
docker-compose up -d

# Access at http://localhost:8089
```

### Environment Variables

Create a `.env` file or set these in your environment:

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=priceghost

# Backend
JWT_SECRET=your_jwt_secret_here
DATABASE_URL=postgresql://postgres:password@db:5432/priceghost

# Frontend (optional)
VITE_API_URL=/api
```

## Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Backend

```bash
cd backend
npm install
npm run db:init  # Initialize database schema
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Configuration

### Notification Setup

#### Telegram
1. Create a bot via [@BotFather](https://t.me/botfather) on Telegram
2. Get your Chat ID from [@userinfobot](https://t.me/userinfobot)
3. Enter both in Settings > Notifications
4. Use the toggle to enable/disable without losing your configuration

#### Discord
1. In your Discord server: Server Settings > Integrations > Webhooks
2. Create a new webhook and copy the URL
3. Enter the URL in Settings > Notifications
4. Use the toggle to enable/disable without losing your configuration

#### Pushover
1. Create an account at [pushover.net](https://pushover.net)
2. Note your User Key from the dashboard
3. Create an application at [pushover.net/apps](https://pushover.net/apps/build) to get an API Token
4. Enter both in Settings > Notifications
5. Use the toggle to enable/disable without losing your configuration

#### ntfy.sh
1. Choose a unique topic name (e.g., `priceghost-yourname`)
2. Subscribe to your topic on your phone:
   - **Android**: Install [ntfy app](https://play.google.com/store/apps/details?id=io.heckel.ntfy) and subscribe to your topic
   - **iOS**: Install [ntfy app](https://apps.apple.com/app/ntfy/id1625396347) and subscribe to your topic
   - **Web**: Visit `https://ntfy.sh/your-topic-name`
3. Enter your topic name in Settings > Notifications
4. No account or API key needed - it just works!

### AI Extraction Setup (Highly Recommended)

For dramatically improved compatibility with difficult sites:

1. Go to Settings > AI Extraction
2. Enable AI-powered extraction
3. Choose your provider:
   - **Anthropic (Claude)** - Get key from [console.anthropic.com](https://console.anthropic.com)
   - **OpenAI (GPT)** - Get key from [platform.openai.com](https://platform.openai.com/api-keys)
   - **Ollama (Local)** - Free, runs locally. Install from [ollama.ai](https://ollama.ai), then `ollama pull llama3.2`
4. Enter your API key (or Ollama server URL for local)
5. Use "Test Extraction" to verify it works

The AI automatically activates when standard scraping fails to extract a price, providing a reliable fallback.

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/registration-status` | Check if registration is enabled |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List all tracked products |
| POST | `/api/products` | Add product by URL |
| GET | `/api/products/:id` | Get product details + stats |
| PUT | `/api/products/:id` | Update settings/notifications |
| DELETE | `/api/products/:id` | Stop tracking product |

### Prices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products/:id/prices` | Get price history |
| POST | `/api/products/:id/refresh` | Force immediate price check |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/notifications` | Get notification config |
| PUT | `/api/settings/notifications` | Update notification settings |
| POST | `/api/settings/notifications/test/telegram` | Send test Telegram notification |
| POST | `/api/settings/notifications/test/discord` | Send test Discord notification |
| POST | `/api/settings/notifications/test/pushover` | Send test Pushover notification |
| POST | `/api/settings/notifications/test/ntfy` | Send test ntfy notification |
| GET | `/api/settings/ai` | Get AI extraction settings |
| PUT | `/api/settings/ai` | Update AI settings |
| POST | `/api/settings/ai/test` | Test AI extraction on a URL |

### Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile` | Get user profile |
| PUT | `/api/profile` | Update profile |
| PUT | `/api/profile/password` | Change password |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |
| DELETE | `/api/admin/users/:id` | Delete user |
| PUT | `/api/admin/users/:id/admin` | Toggle admin status |
| GET | `/api/admin/settings` | Get system settings |
| PUT | `/api/admin/settings` | Update system settings |

## Project Structure

```
PriceGhost/
├── backend/
│   └── src/
│       ├── config/         # Database connection
│       ├── middleware/     # JWT authentication
│       ├── models/         # Database queries
│       ├── routes/         # API endpoints
│       ├── services/       # Scraper, AI extractor, scheduler, notifications
│       └── utils/          # Price parsing utilities
├── frontend/
│   └── src/
│       ├── api/            # Axios client
│       ├── components/     # Reusable components (including PriceSelectionModal)
│       ├── context/        # Auth & Toast contexts
│       ├── hooks/          # Custom hooks
│       └── pages/          # Page components
└── docker-compose.yml
```

## Rate Limiting & Best Practices

To avoid getting blocked by retailers:

- **Staggered checking** - Products are checked at randomized intervals with ±5 minute jitter
- **Request delays** - 2-5 second random delay between checking different products
- **Reasonable intervals** - Default 1 hour; use longer intervals if tracking many products
- **Browser headers** - Requests use standard browser User-Agent strings
- **5-minute warning** - UI warns when selecting aggressive check intervals

## License

MIT

## Star History

<a href="https://star-history.com/#clucraft/PriceGhost&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=clucraft/PriceGhost&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=clucraft/PriceGhost&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=clucraft/PriceGhost&type=Date" />
 </picture>
</a>
