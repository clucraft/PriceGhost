import pool from '../config/database';

// User types and queries
export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  is_admin: boolean;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  discord_webhook_url: string | null;
  created_at: Date;
}

export interface UserProfile {
  id: number;
  email: string;
  name: string | null;
  is_admin: boolean;
  created_at: Date;
}

export interface NotificationSettings {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  discord_webhook_url: string | null;
}

export const userQueries = {
  findByEmail: async (email: string): Promise<User | null> => {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  },

  findById: async (id: number): Promise<User | null> => {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  create: async (email: string, passwordHash: string): Promise<User> => {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
      [email, passwordHash]
    );
    return result.rows[0];
  },

  getNotificationSettings: async (id: number): Promise<NotificationSettings | null> => {
    const result = await pool.query(
      'SELECT telegram_bot_token, telegram_chat_id, discord_webhook_url FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  updateNotificationSettings: async (
    id: number,
    settings: Partial<NotificationSettings>
  ): Promise<NotificationSettings | null> => {
    const fields: string[] = [];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (settings.telegram_bot_token !== undefined) {
      fields.push(`telegram_bot_token = $${paramIndex++}`);
      values.push(settings.telegram_bot_token);
    }
    if (settings.telegram_chat_id !== undefined) {
      fields.push(`telegram_chat_id = $${paramIndex++}`);
      values.push(settings.telegram_chat_id);
    }
    if (settings.discord_webhook_url !== undefined) {
      fields.push(`discord_webhook_url = $${paramIndex++}`);
      values.push(settings.discord_webhook_url);
    }

    if (fields.length === 0) return null;

    values.push(id.toString());
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING telegram_bot_token, telegram_chat_id, discord_webhook_url`,
      values
    );
    return result.rows[0] || null;
  },

  getProfile: async (id: number): Promise<UserProfile | null> => {
    const result = await pool.query(
      'SELECT id, email, name, is_admin, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  updateProfile: async (
    id: number,
    updates: { name?: string }
  ): Promise<UserProfile | null> => {
    const fields: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, name, is_admin, created_at`,
      values
    );
    return result.rows[0] || null;
  },

  updatePassword: async (id: number, passwordHash: string): Promise<boolean> => {
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // Admin queries
  findAll: async (): Promise<UserProfile[]> => {
    const result = await pool.query(
      'SELECT id, email, name, is_admin, created_at FROM users ORDER BY created_at ASC'
    );
    return result.rows;
  },

  delete: async (id: number): Promise<boolean> => {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  setAdmin: async (id: number, isAdmin: boolean): Promise<boolean> => {
    const result = await pool.query(
      'UPDATE users SET is_admin = $1 WHERE id = $2',
      [isAdmin, id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};

// System settings queries
export const systemSettingsQueries = {
  get: async (key: string): Promise<string | null> => {
    const result = await pool.query(
      'SELECT value FROM system_settings WHERE key = $1',
      [key]
    );
    return result.rows[0]?.value || null;
  },

  set: async (key: string, value: string): Promise<void> => {
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  },

  getAll: async (): Promise<Record<string, string>> => {
    const result = await pool.query('SELECT key, value FROM system_settings');
    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    return settings;
  },
};

// Product types and queries
export type StockStatus = 'in_stock' | 'out_of_stock' | 'unknown';

export interface Product {
  id: number;
  user_id: number;
  url: string;
  name: string | null;
  image_url: string | null;
  refresh_interval: number;
  last_checked: Date | null;
  next_check_at: Date | null;
  stock_status: StockStatus;
  price_drop_threshold: number | null;
  notify_back_in_stock: boolean;
  created_at: Date;
}

// Generate jitter between -5 and +5 minutes (in seconds)
function getJitterSeconds(): number {
  return Math.floor(Math.random() * 600) - 300;
}

export interface ProductWithLatestPrice extends Product {
  current_price: number | null;
  currency: string | null;
}

export interface SparklinePoint {
  price: number;
  recorded_at: Date;
}

export interface ProductWithSparkline extends ProductWithLatestPrice {
  sparkline: SparklinePoint[];
  price_change_7d: number | null;
}

export const productQueries = {
  findByUserId: async (userId: number): Promise<ProductWithLatestPrice[]> => {
    const result = await pool.query(
      `SELECT p.*, ph.price as current_price, ph.currency
       FROM products p
       LEFT JOIN LATERAL (
         SELECT price, currency FROM price_history
         WHERE product_id = p.id
         ORDER BY recorded_at DESC
         LIMIT 1
       ) ph ON true
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  findByUserIdWithSparkline: async (userId: number): Promise<ProductWithSparkline[]> => {
    // Get all products with current price
    const productsResult = await pool.query(
      `SELECT p.*, ph.price as current_price, ph.currency
       FROM products p
       LEFT JOIN LATERAL (
         SELECT price, currency FROM price_history
         WHERE product_id = p.id
         ORDER BY recorded_at DESC
         LIMIT 1
       ) ph ON true
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const products = productsResult.rows;
    if (products.length === 0) return [];

    // Get sparkline data for all products (last 7 days)
    const productIds = products.map((p: Product) => p.id);
    const sparklineResult = await pool.query(
      `SELECT product_id, price, recorded_at
       FROM price_history
       WHERE product_id = ANY($1)
       AND recorded_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
       ORDER BY product_id, recorded_at ASC`,
      [productIds]
    );

    // Group sparkline data by product
    const sparklineMap = new Map<number, SparklinePoint[]>();
    for (const row of sparklineResult.rows) {
      const points = sparklineMap.get(row.product_id) || [];
      points.push({ price: row.price, recorded_at: row.recorded_at });
      sparklineMap.set(row.product_id, points);
    }

    // Combine products with sparkline data
    return products.map((product: ProductWithLatestPrice) => {
      const sparkline = sparklineMap.get(product.id) || [];
      let priceChange7d: number | null = null;

      if (sparkline.length >= 2) {
        const firstPrice = parseFloat(String(sparkline[0].price));
        const lastPrice = parseFloat(String(sparkline[sparkline.length - 1].price));
        if (firstPrice > 0) {
          priceChange7d = ((lastPrice - firstPrice) / firstPrice) * 100;
        }
      }

      return {
        ...product,
        sparkline,
        price_change_7d: priceChange7d,
      };
    });
  },

  findById: async (id: number, userId: number): Promise<ProductWithLatestPrice | null> => {
    const result = await pool.query(
      `SELECT p.*, ph.price as current_price, ph.currency
       FROM products p
       LEFT JOIN LATERAL (
         SELECT price, currency FROM price_history
         WHERE product_id = p.id
         ORDER BY recorded_at DESC
         LIMIT 1
       ) ph ON true
       WHERE p.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  create: async (
    userId: number,
    url: string,
    name: string | null,
    imageUrl: string | null,
    refreshInterval: number = 3600,
    stockStatus: StockStatus = 'unknown'
  ): Promise<Product> => {
    // Set initial next_check_at to a random time within the refresh interval
    // This spreads out new products so they don't all check at once
    const randomDelaySeconds = Math.floor(Math.random() * refreshInterval);
    const result = await pool.query(
      `INSERT INTO products (user_id, url, name, image_url, refresh_interval, stock_status, next_check_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + ($7 || ' seconds')::interval)
       RETURNING *`,
      [userId, url, name, imageUrl, refreshInterval, stockStatus, randomDelaySeconds]
    );
    return result.rows[0];
  },

  update: async (
    id: number,
    userId: number,
    updates: {
      name?: string;
      refresh_interval?: number;
      price_drop_threshold?: number | null;
      notify_back_in_stock?: boolean;
    }
  ): Promise<Product | null> => {
    const fields: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.refresh_interval !== undefined) {
      fields.push(`refresh_interval = $${paramIndex++}`);
      values.push(updates.refresh_interval);
    }
    if (updates.price_drop_threshold !== undefined) {
      fields.push(`price_drop_threshold = $${paramIndex++}`);
      values.push(updates.price_drop_threshold);
    }
    if (updates.notify_back_in_stock !== undefined) {
      fields.push(`notify_back_in_stock = $${paramIndex++}`);
      values.push(updates.notify_back_in_stock);
    }

    if (fields.length === 0) return null;

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE products SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  delete: async (id: number, userId: number): Promise<boolean> => {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  updateLastChecked: async (id: number, refreshInterval: number): Promise<void> => {
    // Add jitter of ±5 minutes to spread out checks over time
    const jitterSeconds = getJitterSeconds();
    const nextCheckSeconds = refreshInterval + jitterSeconds;
    await pool.query(
      `UPDATE products
       SET last_checked = CURRENT_TIMESTAMP,
           next_check_at = CURRENT_TIMESTAMP + ($2 || ' seconds')::interval
       WHERE id = $1`,
      [id, nextCheckSeconds]
    );
  },

  updateStockStatus: async (id: number, stockStatus: StockStatus): Promise<void> => {
    await pool.query(
      'UPDATE products SET stock_status = $1 WHERE id = $2',
      [stockStatus, id]
    );
  },

  findDueForRefresh: async (): Promise<Product[]> => {
    const result = await pool.query(
      `SELECT * FROM products
       WHERE next_check_at IS NULL
       OR next_check_at < CURRENT_TIMESTAMP`
    );
    return result.rows;
  },
};

// Price History types and queries
export interface PriceHistory {
  id: number;
  product_id: number;
  price: number;
  currency: string;
  recorded_at: Date;
}

export const priceHistoryQueries = {
  findByProductId: async (
    productId: number,
    days?: number
  ): Promise<PriceHistory[]> => {
    let query = `
      SELECT * FROM price_history
      WHERE product_id = $1
    `;
    const values: (number | string)[] = [productId];

    if (days) {
      query += ` AND recorded_at >= CURRENT_TIMESTAMP - ($2 || ' days')::interval`;
      values.push(days.toString());
    }

    query += ' ORDER BY recorded_at ASC';

    const result = await pool.query(query, values);
    return result.rows;
  },

  create: async (
    productId: number,
    price: number,
    currency: string = 'USD'
  ): Promise<PriceHistory> => {
    const result = await pool.query(
      `INSERT INTO price_history (product_id, price, currency)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [productId, price, currency]
    );
    return result.rows[0];
  },

  getLatest: async (productId: number): Promise<PriceHistory | null> => {
    const result = await pool.query(
      `SELECT * FROM price_history
       WHERE product_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [productId]
    );
    return result.rows[0] || null;
  },

  getStats: async (productId: number): Promise<{
    min_price: number;
    max_price: number;
    avg_price: number;
    price_count: number;
  } | null> => {
    const result = await pool.query(
      `SELECT
         MIN(price) as min_price,
         MAX(price) as max_price,
         AVG(price)::decimal(10,2) as avg_price,
         COUNT(*) as price_count
       FROM price_history
       WHERE product_id = $1`,
      [productId]
    );
    return result.rows[0] || null;
  },
};
