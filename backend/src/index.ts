import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import priceRoutes from './routes/prices';
import settingsRoutes from './routes/settings';
import profileRoutes from './routes/profile';
import adminRoutes from './routes/admin';
import { startScheduler } from './services/scheduler';
import pool from './config/database';

// Run database migrations
async function runMigrations() {
  const client = await pool.connect();
  try {
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

    console.log('Database migrations completed');
  } catch (error) {
    console.error('Migration error:', error);
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

// Start server
app.listen(PORT, async () => {
  console.log(`PriceGhost API server running on port ${PORT}`);

  // Run database migrations
  await runMigrations();

  // Start the background price checker
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }
});

export default app;
