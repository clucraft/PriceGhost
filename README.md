# PriceGhost

A full-stack web application for tracking product prices across any website. Monitor prices over time and visualize price history with interactive charts.

## Features

- Track prices from any product URL
- Automatic price extraction using heuristics and structured data
- Configurable refresh intervals (15 min to 24 hours)
- Price history visualization with Recharts
- User authentication with JWT
- Background price checking with node-cron
- Docker support for easy deployment

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, Vite, TypeScript
- **Database**: PostgreSQL
- **Scraping**: Cheerio
- **Charts**: Recharts
- **Auth**: JWT + bcrypt
- **Containerization**: Docker

## Quick Start with Docker

1. Clone the repository:
```bash
git clone https://github.com/yourusername/priceghost.git
cd priceghost
```

2. Start all services:
```bash
docker-compose up -d
```

3. Initialize the database:
```bash
docker-compose exec backend npm run db:init
```

4. Access the application at http://localhost

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 16+

### Backend Setup

```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Initialize database
npm run db:init

# Start development server
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install

# Start development server
npm run dev
```

## Environment Variables

### Backend (.env)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/priceghost
JWT_SECRET=your-secret-key
PORT=3001
NODE_ENV=development
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login

### Products (Protected)
- `GET /api/products` - List tracked products
- `POST /api/products` - Add product to track
- `GET /api/products/:id` - Get product details
- `PUT /api/products/:id` - Update product settings
- `DELETE /api/products/:id` - Remove product

### Prices (Protected)
- `GET /api/products/:id/prices` - Get price history
- `POST /api/products/:id/refresh` - Force price refresh

## Project Structure

```
PriceGhost/
├── backend/
│   ├── src/
│   │   ├── config/         # Database configuration
│   │   ├── middleware/     # JWT auth middleware
│   │   ├── models/         # Database queries
│   │   ├── routes/         # API routes
│   │   ├── services/       # Scraper & scheduler
│   │   └── utils/          # Price parsing utilities
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios client
│   │   ├── components/     # React components
│   │   ├── context/        # Auth context
│   │   ├── hooks/          # Custom hooks
│   │   └── pages/          # Page components
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

## License

MIT
