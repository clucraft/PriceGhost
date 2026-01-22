# PriceGhost

A self-hosted price tracking application that monitors product prices from any website. Get notified when prices drop, hit your target price, or items come back in stock.

<img width="1609" height="1094" alt="image" src="https://github.com/user-attachments/assets/311f410c-170c-4f0c-81e3-3ba7e0141fa7" />

## Features

### Price Tracking
- **Universal scraping** - Works with virtually any e-commerce website
- **Smart price detection** - Uses multiple strategies: JSON-LD structured data, meta tags, CSS selectors, and pattern matching
- **AI-powered fallback** - Optional Claude (Anthropic) or GPT (OpenAI) integration for difficult-to-scrape sites
- **Headless browser support** - Puppeteer with stealth mode for JavaScript-rendered pages
- **Price history charts** - Interactive visualization with customizable date ranges (7d, 30d, 90d, all time)
- **7-day sparklines** - Quick price trend overview on the dashboard
- **Configurable check intervals** - From 5 minutes to 24 hours per product

### Notifications
- **Price drop alerts** - Set a threshold (e.g., "notify when it drops $10+")
- **Target price alerts** - Set your ideal price and get notified when reached
- **Back-in-stock alerts** - Get notified when out-of-stock items become available
- **Telegram** - Get alerts via Telegram bot
- **Discord** - Send alerts to any Discord channel via webhooks

### Stock Tracking
- **Out-of-stock detection** - Automatically detects when products are unavailable
- **Visual indicators** - Clear badges showing stock status on dashboard and detail pages
- **Stock change notifications** - Get notified when items come back in stock

### User Management
- **Multi-user support** - Each user has their own products and settings
- **Admin panel** - Manage users, create accounts, toggle admin privileges
- **Registration control** - Enable/disable public registration
- **Profile management** - Update display name and change password

### User Experience
- **Toast notifications** - Visual feedback for all actions
- **Responsive design** - Works on desktop and mobile
- **Manual refresh** - Force an immediate price check with one click
- **Price statistics** - See min, max, and average prices for each product

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL |
| **Scraping** | Cheerio, Puppeteer (with stealth plugin) |
| **AI Extraction** | Anthropic Claude, OpenAI GPT (optional) |
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

#### Discord
1. In your Discord server: Server Settings > Integrations > Webhooks
2. Create a new webhook and copy the URL
3. Enter the URL in Settings > Notifications

### AI Extraction (Optional)

For improved compatibility with difficult sites:

1. Go to Settings > AI Settings
2. Enable AI-powered extraction
3. Choose your provider (Anthropic or OpenAI)
4. Enter your API key

The AI will automatically be used as a fallback when standard scraping fails to extract a price.

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
| PUT | `/api/settings/notifications` | Update Telegram/Discord settings |
| POST | `/api/settings/notifications/test/telegram` | Send test Telegram notification |
| POST | `/api/settings/notifications/test/discord` | Send test Discord notification |
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

- **Staggered checking** - Products are checked at randomized intervals with jitter
- **Request delays** - 2-5 second random delay between checking different products
- **Reasonable intervals** - Default 1 hour; use longer intervals if tracking many products
- **Browser headers** - Requests use standard browser User-Agent strings

## About This Project

This project was built collaboratively with [Claude](https://claude.ai) (Anthropic's AI assistant) using [Claude Code](https://claude.ai/claude-code). Every feature was developed through iterative conversation and code generation.

Built with Claude Opus 4.5.

## License

MIT
