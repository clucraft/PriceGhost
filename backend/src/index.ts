import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import priceRoutes from './routes/prices';
import settingsRoutes from './routes/settings';
import profileRoutes from './routes/profile';
import adminRoutes from './routes/admin';
import notificationRoutes from './routes/notifications';
import { startScheduler } from './services/scheduler';
import pool from './config/database';

// Run database migrations
async function runMigrations() {
  const client = await pool.connect();
  try {
    // First, ensure base tables exist (for fresh installs without init.sql)
    await client.query(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        is_admin BOOLEAN DEFAULT false,
        telegram_bot_token VARCHAR(255),
        telegram_chat_id VARCHAR(255),
        discord_webhook_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- System settings table
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Default system settings
      INSERT INTO system_settings (key, value) VALUES ('registration_enabled', 'true')
      ON CONFLICT (key) DO NOTHING;

      -- Products table
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        name VARCHAR(255),
        image_url TEXT,
        refresh_interval INTEGER DEFAULT 3600,
        last_checked TIMESTAMP,
        next_check_at TIMESTAMP,
        stock_status VARCHAR(20) DEFAULT 'unknown',
        price_drop_threshold DECIMAL(10,2),
        target_price DECIMAL(10,2),
        notify_back_in_stock BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, url)
      );

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
    `);

    console.log('Base tables ensured');

    // Add AI settings columns to users table if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ai_enabled') THEN
          ALTER TABLE users ADD COLUMN ai_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ai_provider') THEN
          ALTER TABLE users ADD COLUMN ai_provider VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'anthropic_api_key') THEN
          ALTER TABLE users ADD COLUMN anthropic_api_key TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'openai_api_key') THEN
          ALTER TABLE users ADD COLUMN openai_api_key TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'pushover_user_key') THEN
          ALTER TABLE users ADD COLUMN pushover_user_key TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'pushover_app_token') THEN
          ALTER TABLE users ADD COLUMN pushover_app_token TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'telegram_enabled') THEN
          ALTER TABLE users ADD COLUMN telegram_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'discord_enabled') THEN
          ALTER TABLE users ADD COLUMN discord_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'pushover_enabled') THEN
          ALTER TABLE users ADD COLUMN pushover_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ollama_base_url') THEN
          ALTER TABLE users ADD COLUMN ollama_base_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ollama_model') THEN
          ALTER TABLE users ADD COLUMN ollama_model TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ntfy_topic') THEN
          ALTER TABLE users ADD COLUMN ntfy_topic TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ntfy_enabled') THEN
          ALTER TABLE users ADD COLUMN ntfy_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ai_verification_enabled') THEN
          ALTER TABLE users ADD COLUMN ai_verification_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'notifications_cleared_at') THEN
          ALTER TABLE users ADD COLUMN notifications_cleared_at TIMESTAMP;
        END IF;
      END $$;
    `);

    // Create stock_status_history table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_status_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_stock_history_product_date
        ON stock_status_history(product_id, changed_at);
    `);

    // Add ai_status column to price_history table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_history' AND column_name = 'ai_status') THEN
          ALTER TABLE price_history ADD COLUMN ai_status VARCHAR(20);
        END IF;
      END $$;
    `);

    // Add multi-strategy voting columns to products table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'preferred_extraction_method') THEN
          ALTER TABLE products ADD COLUMN preferred_extraction_method VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'needs_price_review') THEN
          ALTER TABLE products ADD COLUMN needs_price_review BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'price_candidates') THEN
          ALTER TABLE products ADD COLUMN price_candidates JSONB;
        END IF;
        -- Anchor price: the price the user confirmed, used to select correct variant on refresh
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'anchor_price') THEN
          ALTER TABLE products ADD COLUMN anchor_price DECIMAL(10,2);
        END IF;
        -- Per-product AI verification disable flag
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'ai_verification_disabled') THEN
          ALTER TABLE products ADD COLUMN ai_verification_disabled BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);

    // Create notification_history table for tracking all triggered notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        notification_type VARCHAR(50) NOT NULL,
        triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        old_price DECIMAL(10,2),
        new_price DECIMAL(10,2),
        currency VARCHAR(10),
        price_change_percent DECIMAL(5,2),
        target_price DECIMAL(10,2),
        old_stock_status VARCHAR(20),
        new_stock_status VARCHAR(20),
        channels_notified JSONB,
        product_name VARCHAR(500),
        product_url TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notification_history_user_date
        ON notification_history(user_id, triggered_at DESC);

      CREATE INDEX IF NOT EXISTS idx_notification_history_product
        ON notification_history(product_id);
    `);

    console.log('Database migrations completed');
  } catch (error) {
    console.error('Migration error:', error);
    throw error; // Re-throw to prevent server from starting with broken DB
  } finally {
    client.release();
  }
}

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/products', priceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Error handling middleware
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
);

// Start server with proper initialization sequence
async function startServer() {
  try {
    // Run database migrations BEFORE accepting connections
    await runMigrations();

    app.listen(PORT, () => {
      console.log(`PriceGhost API server running on port ${PORT}`);

      // Start the background price checker
      if (process.env.NODE_ENV !== 'test') {
        startScheduler();
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
