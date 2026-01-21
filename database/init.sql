-- PriceGhost Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  telegram_bot_token VARCHAR(255),
  telegram_chat_id VARCHAR(255),
  discord_webhook_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration: Add notification columns to users if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'telegram_bot_token'
  ) THEN
    ALTER TABLE users ADD COLUMN telegram_bot_token VARCHAR(255);
    ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(255);
    ALTER TABLE users ADD COLUMN discord_webhook_url TEXT;
  END IF;
END $$;

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  name VARCHAR(255),
  image_url TEXT,
  refresh_interval INTEGER DEFAULT 3600,
  last_checked TIMESTAMP,
  stock_status VARCHAR(20) DEFAULT 'unknown',
  price_drop_threshold DECIMAL(10,2),
  notify_back_in_stock BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, url)
);

-- Migration: Add stock_status column if it doesn't exist (for existing databases)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'stock_status'
  ) THEN
    ALTER TABLE products ADD COLUMN stock_status VARCHAR(20) DEFAULT 'unknown';
  END IF;
END $$;

-- Migration: Add notification columns to products if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price_drop_threshold'
  ) THEN
    ALTER TABLE products ADD COLUMN price_drop_threshold DECIMAL(10,2);
    ALTER TABLE products ADD COLUMN notify_back_in_stock BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Price history table
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster price history queries
CREATE INDEX IF NOT EXISTS idx_price_history_product_date
ON price_history(product_id, recorded_at);
