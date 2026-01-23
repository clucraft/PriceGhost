# PriceGhost

A self-hosted price tracking application that monitors product prices from any website. Get notified when prices drop, hit your target price, or items come back in stock.

<img width="1609" height="1094" alt="image" src="https://github.com/user-attachments/assets/311f410c-170c-4f0c-81e3-3ba7e0141fa7" />

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

## Strongly Recommended: Enable AI Extraction

While PriceGhost includes multiple scraping strategies (JSON-LD, meta tags, CSS selectors, pattern matching, and headless browser), **we highly recommend enabling AI-powered extraction** for the best results.

Modern e-commerce sites use increasingly complex layouts, dynamic pricing, and anti-scraping measures. AI extraction serves as an intelligent fallback that can understand page context and reliably extract prices even from difficult sites.

**To enable:**
1. Get an API key from [Anthropic](https://console.anthropic.com) (Claude) or [OpenAI](https://platform.openai.com)
2. Go to Settings > AI Extraction
3. Enable AI extraction and enter your key
4. That's it! AI will automatically kick in when standard scraping fails

The cost is minimal (fractions of a cent per extraction) and dramatically improves success rates.

---

## Features

### Price Tracking
- **Universal scraping** - Works with virtually any e-commerce website
- **Smart price detection** - Uses multiple strategies: JSON-LD structured data, meta tags, CSS selectors, and pattern matching
- **AI-powered fallback** - Optional Claude (Anthropic) or GPT (OpenAI) integration for difficult-to-scrape sites
- **Headless browser support** - Puppeteer with stealth mode for JavaScript-rendered pages
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
- **Per-channel toggles** - Enable/disable each notification channel independently
- **Test notifications** - Send test alerts to verify your setup

### Stock Tracking
- **Out-of-stock detection** - Automatically detects when products are unavailable
- **Visual indicators** - Clear badges showing stock status on dashboard and detail pages
- **Stock change notifications** - Get notified when items come back in stock

### User Experience
- **PWA Support&& - Support for installing on mobile through "Add to Home Screen"
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

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL |
| **Scraping** | Cheerio, Puppeteer (with stealth plugin) |
| **AI Extraction** | Anthropic Claude, OpenAI GPT (optional but recommended) |
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

### AI Extraction Setup (Highly Recommended)

For dramatically improved compatibility with difficult sites:

1. Go to Settings > AI Extraction
2. Enable AI-powered extraction
3. Choose your provider:
   - **Anthropic (Claude)** - Get key from [console.anthropic.com](https://console.anthropic.com)
   - **OpenAI (GPT)** - Get key from [platform.openai.com](https://platform.openai.com/api-keys)
4. Enter your API key
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
│       ├── components/     # Reusable components
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
