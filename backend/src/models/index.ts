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
  telegram_enabled: boolean;
  discord_webhook_url: string | null;
  discord_enabled: boolean;
  pushover_user_key: string | null;
  pushover_app_token: string | null;
  pushover_enabled: boolean;
  ntfy_topic: string | null;
  ntfy_server_url: string | null;
  ntfy_username: string | null;
  ntfy_password: string | null;
  ntfy_enabled: boolean;
  gotify_url: string | null;
  gotify_app_token: string | null;
  gotify_enabled: boolean;
}

export interface AISettings {
  ai_enabled: boolean;
  ai_verification_enabled: boolean;
  ai_provider: 'anthropic' | 'openai' | 'ollama' | 'gemini' | null;
  anthropic_api_key: string | null;
  anthropic_model: string | null;
  openai_api_key: string | null;
  openai_model: string | null;
  ollama_base_url: string | null;
  ollama_model: string | null;
  gemini_api_key: string | null;
  gemini_model: string | null;
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
      `SELECT telegram_bot_token, telegram_chat_id, COALESCE(telegram_enabled, true) as telegram_enabled,
              discord_webhook_url, COALESCE(discord_enabled, true) as discord_enabled,
              pushover_user_key, pushover_app_token, COALESCE(pushover_enabled, true) as pushover_enabled,
              ntfy_topic, ntfy_server_url, ntfy_username, ntfy_password, COALESCE(ntfy_enabled, true) as ntfy_enabled,
              gotify_url, gotify_app_token, COALESCE(gotify_enabled, true) as gotify_enabled
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  updateNotificationSettings: async (
    id: number,
    settings: Partial<NotificationSettings>
  ): Promise<NotificationSettings | null> => {
    const fields: string[] = [];
    const values: (string | boolean | null)[] = [];
    let paramIndex = 1;

    if (settings.telegram_bot_token !== undefined) {
      fields.push(`telegram_bot_token = $${paramIndex++}`);
      values.push(settings.telegram_bot_token);
    }
    if (settings.telegram_chat_id !== undefined) {
      fields.push(`telegram_chat_id = $${paramIndex++}`);
      values.push(settings.telegram_chat_id);
    }
    if (settings.telegram_enabled !== undefined) {
      fields.push(`telegram_enabled = $${paramIndex++}`);
      values.push(settings.telegram_enabled);
    }
    if (settings.discord_webhook_url !== undefined) {
      fields.push(`discord_webhook_url = $${paramIndex++}`);
      values.push(settings.discord_webhook_url);
    }
    if (settings.discord_enabled !== undefined) {
      fields.push(`discord_enabled = $${paramIndex++}`);
      values.push(settings.discord_enabled);
    }
    if (settings.pushover_user_key !== undefined) {
      fields.push(`pushover_user_key = $${paramIndex++}`);
      values.push(settings.pushover_user_key);
    }
    if (settings.pushover_app_token !== undefined) {
      fields.push(`pushover_app_token = $${paramIndex++}`);
      values.push(settings.pushover_app_token);
    }
    if (settings.pushover_enabled !== undefined) {
      fields.push(`pushover_enabled = $${paramIndex++}`);
      values.push(settings.pushover_enabled);
    }
    if (settings.ntfy_topic !== undefined) {
      fields.push(`ntfy_topic = $${paramIndex++}`);
      values.push(settings.ntfy_topic);
    }
    if (settings.ntfy_server_url !== undefined) {
      fields.push(`ntfy_server_url = $${paramIndex++}`);
      values.push(settings.ntfy_server_url);
    }
    if (settings.ntfy_username !== undefined) {
      fields.push(`ntfy_username = $${paramIndex++}`);
      values.push(settings.ntfy_username);
    }
    if (settings.ntfy_password !== undefined) {
      fields.push(`ntfy_password = $${paramIndex++}`);
      values.push(settings.ntfy_password);
    }
    if (settings.ntfy_enabled !== undefined) {
      fields.push(`ntfy_enabled = $${paramIndex++}`);
      values.push(settings.ntfy_enabled);
    }
    if (settings.gotify_url !== undefined) {
      fields.push(`gotify_url = $${paramIndex++}`);
      values.push(settings.gotify_url);
    }
    if (settings.gotify_app_token !== undefined) {
      fields.push(`gotify_app_token = $${paramIndex++}`);
      values.push(settings.gotify_app_token);
    }
    if (settings.gotify_enabled !== undefined) {
      fields.push(`gotify_enabled = $${paramIndex++}`);
      values.push(settings.gotify_enabled);
    }

    if (fields.length === 0) return null;

    values.push(id.toString());
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING telegram_bot_token, telegram_chat_id, COALESCE(telegram_enabled, true) as telegram_enabled,
                 discord_webhook_url, COALESCE(discord_enabled, true) as discord_enabled,
                 pushover_user_key, pushover_app_token, COALESCE(pushover_enabled, true) as pushover_enabled,
                 ntfy_topic, ntfy_server_url, ntfy_username, ntfy_password, COALESCE(ntfy_enabled, true) as ntfy_enabled,
                 gotify_url, gotify_app_token, COALESCE(gotify_enabled, true) as gotify_enabled`,
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

  getAISettings: async (id: number): Promise<AISettings | null> => {
    const result = await pool.query(
      `SELECT ai_enabled, COALESCE(ai_verification_enabled, false) as ai_verification_enabled,
              ai_provider, anthropic_api_key, anthropic_model, openai_api_key, openai_model,
              ollama_base_url, ollama_model, gemini_api_key, gemini_model
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  updateAISettings: async (
    id: number,
    settings: Partial<AISettings>
  ): Promise<AISettings | null> => {
    const fields: string[] = [];
    const values: (string | boolean | null)[] = [];
    let paramIndex = 1;

    if (settings.ai_enabled !== undefined) {
      fields.push(`ai_enabled = $${paramIndex++}`);
      values.push(settings.ai_enabled);
    }
    if (settings.ai_verification_enabled !== undefined) {
      fields.push(`ai_verification_enabled = $${paramIndex++}`);
      values.push(settings.ai_verification_enabled);
    }
    if (settings.ai_provider !== undefined) {
      fields.push(`ai_provider = $${paramIndex++}`);
      values.push(settings.ai_provider);
    }
    if (settings.anthropic_api_key !== undefined) {
      fields.push(`anthropic_api_key = $${paramIndex++}`);
      values.push(settings.anthropic_api_key);
    }
    if (settings.anthropic_model !== undefined) {
      fields.push(`anthropic_model = $${paramIndex++}`);
      values.push(settings.anthropic_model);
    }
    if (settings.openai_api_key !== undefined) {
      fields.push(`openai_api_key = $${paramIndex++}`);
      values.push(settings.openai_api_key);
    }
    if (settings.openai_model !== undefined) {
      fields.push(`openai_model = $${paramIndex++}`);
      values.push(settings.openai_model);
    }
    if (settings.ollama_base_url !== undefined) {
      fields.push(`ollama_base_url = $${paramIndex++}`);
      values.push(settings.ollama_base_url);
    }
    if (settings.ollama_model !== undefined) {
      fields.push(`ollama_model = $${paramIndex++}`);
      values.push(settings.ollama_model);
    }
    if (settings.gemini_api_key !== undefined) {
      fields.push(`gemini_api_key = $${paramIndex++}`);
      values.push(settings.gemini_api_key);
    }
    if (settings.gemini_model !== undefined) {
      fields.push(`gemini_model = $${paramIndex++}`);
      values.push(settings.gemini_model);
    }

    if (fields.length === 0) return null;

    values.push(id.toString());
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING ai_enabled, COALESCE(ai_verification_enabled, false) as ai_verification_enabled,
                 ai_provider, anthropic_api_key, anthropic_model, openai_api_key, openai_model,
                 ollama_base_url, ollama_model, gemini_api_key, gemini_model`,
      values
    );
    return result.rows[0] || null;
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
  target_price: number | null;
  notify_back_in_stock: boolean;
  ai_verification_disabled: boolean;
  ai_extraction_disabled: boolean;
  checking_paused: boolean;
  created_at: Date;
}

// Generate jitter between -5 and +5 minutes (in seconds)
function getJitterSeconds(): number {
  return Math.floor(Math.random() * 600) - 300;
}

export interface ProductWithLatestPrice extends Product {
  current_price: number | null;
  currency: string | null;
  ai_status: AIStatus;
}

export interface SparklinePoint {
  price: number;
  recorded_at: Date;
}

export interface ProductWithSparkline extends ProductWithLatestPrice {
  sparkline: SparklinePoint[];
  price_change_7d: number | null;
  min_price: number | null;
}

export const productQueries = {
  findByUserId: async (userId: number): Promise<ProductWithLatestPrice[]> => {
    const result = await pool.query(
      `SELECT p.*, ph.price as current_price, ph.currency, ph.ai_status
       FROM products p
       LEFT JOIN LATERAL (
         SELECT price, currency, ai_status FROM price_history
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
      `SELECT p.*, ph.price as current_price, ph.currency, ph.ai_status
       FROM products p
       LEFT JOIN LATERAL (
         SELECT price, currency, ai_status FROM price_history
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

    // Get min prices for all products (all-time low)
    const minPriceResult = await pool.query(
      `SELECT product_id, MIN(price) as min_price
       FROM price_history
       WHERE product_id = ANY($1)
       GROUP BY product_id`,
      [productIds]
    );

    // Group sparkline data by product
    const sparklineMap = new Map<number, SparklinePoint[]>();
    for (const row of sparklineResult.rows) {
      const points = sparklineMap.get(row.product_id) || [];
      points.push({ price: row.price, recorded_at: row.recorded_at });
      sparklineMap.set(row.product_id, points);
    }

    // Map min prices by product
    const minPriceMap = new Map<number, number>();
    for (const row of minPriceResult.rows) {
      minPriceMap.set(row.product_id, parseFloat(row.min_price));
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
        min_price: minPriceMap.get(product.id) || null,
      };
    });
  },

  findById: async (id: number, userId: number): Promise<ProductWithLatestPrice | null> => {
    const result = await pool.query(
      `SELECT p.*, ph.price as current_price, ph.currency, ph.ai_status
       FROM products p
       LEFT JOIN LATERAL (
         SELECT price, currency, ai_status FROM price_history
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
      target_price?: number | null;
      notify_back_in_stock?: boolean;
      ai_verification_disabled?: boolean;
      ai_extraction_disabled?: boolean;
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
    if (updates.target_price !== undefined) {
      fields.push(`target_price = $${paramIndex++}`);
      values.push(updates.target_price);
    }
    if (updates.notify_back_in_stock !== undefined) {
      fields.push(`notify_back_in_stock = $${paramIndex++}`);
      values.push(updates.notify_back_in_stock);
    }
    if (updates.ai_verification_disabled !== undefined) {
      fields.push(`ai_verification_disabled = $${paramIndex++}`);
      values.push(updates.ai_verification_disabled);
    }
    if (updates.ai_extraction_disabled !== undefined) {
      fields.push(`ai_extraction_disabled = $${paramIndex++}`);
      values.push(updates.ai_extraction_disabled);
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
       WHERE (next_check_at IS NULL OR next_check_at < CURRENT_TIMESTAMP)
       AND (checking_paused IS NULL OR checking_paused = false)`
    );
    return result.rows;
  },

  updateExtractionMethod: async (id: number, method: string): Promise<void> => {
    await pool.query(
      'UPDATE products SET preferred_extraction_method = $1, needs_price_review = false WHERE id = $2',
      [method, id]
    );
  },

  getPreferredExtractionMethod: async (id: number): Promise<string | null> => {
    const result = await pool.query(
      'SELECT preferred_extraction_method FROM products WHERE id = $1',
      [id]
    );
    return result.rows[0]?.preferred_extraction_method || null;
  },

  updateAnchorPrice: async (id: number, price: number): Promise<void> => {
    await pool.query(
      'UPDATE products SET anchor_price = $1 WHERE id = $2',
      [price, id]
    );
  },

  getAnchorPrice: async (id: number): Promise<number | null> => {
    const result = await pool.query(
      'SELECT anchor_price FROM products WHERE id = $1',
      [id]
    );
    return result.rows[0]?.anchor_price ? parseFloat(result.rows[0].anchor_price) : null;
  },

  isAiVerificationDisabled: async (id: number): Promise<boolean> => {
    const result = await pool.query(
      'SELECT ai_verification_disabled FROM products WHERE id = $1',
      [id]
    );
    return result.rows[0]?.ai_verification_disabled === true;
  },

  isAiExtractionDisabled: async (id: number): Promise<boolean> => {
    const result = await pool.query(
      'SELECT ai_extraction_disabled FROM products WHERE id = $1',
      [id]
    );
    return result.rows[0]?.ai_extraction_disabled === true;
  },

  bulkSetCheckingPaused: async (ids: number[], userId: number, paused: boolean): Promise<number> => {
    if (ids.length === 0) return 0;
    const result = await pool.query(
      `UPDATE products SET checking_paused = $1 WHERE id = ANY($2) AND user_id = $3`,
      [paused, ids, userId]
    );
    return result.rowCount || 0;
  },
};

// Price History types and queries
export type AIStatus = 'verified' | 'corrected' | null;

export interface PriceHistory {
  id: number;
  product_id: number;
  price: number;
  currency: string;
  ai_status: AIStatus;
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
    currency: string = 'USD',
    aiStatus: AIStatus = null
  ): Promise<PriceHistory> => {
    const result = await pool.query(
      `INSERT INTO price_history (product_id, price, currency, ai_status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [productId, price, currency, aiStatus]
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

// Stock Status History types and queries
export interface StockStatusHistory {
  id: number;
  product_id: number;
  status: StockStatus;
  changed_at: Date;
}

export interface StockStatusStats {
  availability_percent: number;
  outage_count: number;
  avg_outage_days: number | null;
  longest_outage_days: number | null;
  current_status: StockStatus;
  days_in_current_status: number;
}

export const stockStatusHistoryQueries = {
  // Get all status changes for a product
  getByProductId: async (productId: number, days?: number): Promise<StockStatusHistory[]> => {
    let query = `
      SELECT * FROM stock_status_history
      WHERE product_id = $1
    `;
    const values: (number | string)[] = [productId];

    if (days) {
      query += ` AND changed_at >= CURRENT_TIMESTAMP - ($2 || ' days')::interval`;
      values.push(days.toString());
    }

    query += ' ORDER BY changed_at ASC';

    const result = await pool.query(query, values);
    return result.rows;
  },

  // Get the most recent status for a product
  getLatest: async (productId: number): Promise<StockStatusHistory | null> => {
    const result = await pool.query(
      `SELECT * FROM stock_status_history
       WHERE product_id = $1
       ORDER BY changed_at DESC
       LIMIT 1`,
      [productId]
    );
    return result.rows[0] || null;
  },

  // Record a status change (only if status actually changed)
  recordChange: async (productId: number, status: StockStatus): Promise<StockStatusHistory | null> => {
    // First check if this is actually a change
    const latest = await stockStatusHistoryQueries.getLatest(productId);

    // If status is the same as the last recorded status, don't create a new record
    if (latest && latest.status === status) {
      return null;
    }

    const result = await pool.query(
      `INSERT INTO stock_status_history (product_id, status)
       VALUES ($1, $2)
       RETURNING *`,
      [productId, status]
    );
    return result.rows[0];
  },

  // Calculate availability statistics
  getStats: async (productId: number, days: number = 30): Promise<StockStatusStats | null> => {
    // Get all status changes within the period
    const history = await stockStatusHistoryQueries.getByProductId(productId);

    if (history.length === 0) {
      return null;
    }

    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Calculate time spent in each status
    let inStockMs = 0;
    let outOfStockMs = 0;
    const outages: number[] = []; // Duration of each outage in ms
    let currentOutageStart: Date | null = null;

    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const entryTime = new Date(entry.changed_at);
      const nextEntry = history[i + 1];
      const nextTime = nextEntry ? new Date(nextEntry.changed_at) : now;

      // Only count time within our period
      const segmentStart = entryTime < periodStart ? periodStart : entryTime;
      const segmentEnd = nextTime;

      if (segmentEnd <= periodStart) continue; // This segment is before our period

      const duration = segmentEnd.getTime() - segmentStart.getTime();

      if (entry.status === 'in_stock') {
        inStockMs += duration;
        if (currentOutageStart) {
          // Outage ended
          outages.push(entryTime.getTime() - currentOutageStart.getTime());
          currentOutageStart = null;
        }
      } else if (entry.status === 'out_of_stock') {
        outOfStockMs += duration;
        if (!currentOutageStart) {
          currentOutageStart = entryTime;
        }
      }
    }

    const totalMs = inStockMs + outOfStockMs;
    const availabilityPercent = totalMs > 0 ? Math.round((inStockMs / totalMs) * 100) : 0;

    const avgOutageDays = outages.length > 0
      ? outages.reduce((a, b) => a + b, 0) / outages.length / (24 * 60 * 60 * 1000)
      : null;

    const longestOutageDays = outages.length > 0
      ? Math.max(...outages) / (24 * 60 * 60 * 1000)
      : null;

    const currentStatus = history[history.length - 1].status;
    const lastChangeTime = new Date(history[history.length - 1].changed_at);
    const daysInCurrentStatus = Math.floor((now.getTime() - lastChangeTime.getTime()) / (24 * 60 * 60 * 1000));

    return {
      availability_percent: availabilityPercent,
      outage_count: outages.length,
      avg_outage_days: avgOutageDays ? Math.round(avgOutageDays * 10) / 10 : null,
      longest_outage_days: longestOutageDays ? Math.round(longestOutageDays * 10) / 10 : null,
      current_status: currentStatus,
      days_in_current_status: daysInCurrentStatus,
    };
  },
};

// Notification History types and queries
export type NotificationType = 'price_drop' | 'price_target' | 'stock_change';

export interface NotificationHistory {
  id: number;
  user_id: number;
  product_id: number;
  notification_type: NotificationType;
  triggered_at: Date;
  old_price: number | null;
  new_price: number | null;
  currency: string | null;
  price_change_percent: number | null;
  target_price: number | null;
  old_stock_status: string | null;
  new_stock_status: string | null;
  channels_notified: string[];
  product_name: string | null;
  product_url: string | null;
}

export interface CreateNotificationHistory {
  user_id: number;
  product_id: number;
  notification_type: NotificationType;
  old_price?: number;
  new_price?: number;
  currency?: string;
  price_change_percent?: number;
  target_price?: number;
  old_stock_status?: string;
  new_stock_status?: string;
  channels_notified: string[];
  product_name?: string;
  product_url?: string;
}

export const notificationHistoryQueries = {
  // Create a new notification history record
  create: async (data: CreateNotificationHistory): Promise<NotificationHistory> => {
    const result = await pool.query(
      `INSERT INTO notification_history
       (user_id, product_id, notification_type, old_price, new_price, currency,
        price_change_percent, target_price, old_stock_status, new_stock_status,
        channels_notified, product_name, product_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.user_id,
        data.product_id,
        data.notification_type,
        data.old_price || null,
        data.new_price || null,
        data.currency || null,
        data.price_change_percent || null,
        data.target_price || null,
        data.old_stock_status || null,
        data.new_stock_status || null,
        JSON.stringify(data.channels_notified),
        data.product_name || null,
        data.product_url || null,
      ]
    );
    return result.rows[0];
  },

  // Get notifications for a user with pagination
  getByUserId: async (
    userId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<NotificationHistory[]> => {
    const result = await pool.query(
      `SELECT * FROM notification_history
       WHERE user_id = $1
       ORDER BY triggered_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  },

  // Get recent notifications (for bell dropdown) - respects cleared_at
  getRecent: async (userId: number, limit: number = 10): Promise<NotificationHistory[]> => {
    const result = await pool.query(
      `SELECT nh.* FROM notification_history nh
       JOIN users u ON u.id = nh.user_id
       WHERE nh.user_id = $1
         AND (u.notifications_cleared_at IS NULL OR nh.triggered_at > u.notifications_cleared_at)
       ORDER BY nh.triggered_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },

  // Count notifications since last clear (for badge)
  countRecent: async (userId: number, hours: number = 24): Promise<number> => {
    const result = await pool.query(
      `SELECT COUNT(*) FROM notification_history nh
       JOIN users u ON u.id = nh.user_id
       WHERE nh.user_id = $1
         AND nh.triggered_at > NOW() - INTERVAL '1 hour' * $2
         AND (u.notifications_cleared_at IS NULL OR nh.triggered_at > u.notifications_cleared_at)`,
      [userId, hours]
    );
    return parseInt(result.rows[0].count, 10);
  },

  // Clear notifications (sets timestamp, doesn't delete)
  clear: async (userId: number): Promise<void> => {
    await pool.query(
      `UPDATE users SET notifications_cleared_at = NOW() WHERE id = $1`,
      [userId]
    );
  },

  // Get total count for pagination
  getTotalCount: async (userId: number): Promise<number> => {
    const result = await pool.query(
      `SELECT COUNT(*) FROM notification_history WHERE user_id = $1`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  // Delete old notifications (for cleanup)
  deleteOlderThan: async (days: number): Promise<number> => {
    const result = await pool.query(
      `DELETE FROM notification_history
       WHERE triggered_at < NOW() - INTERVAL '1 day' * $1`,
      [days]
    );
    return result.rowCount || 0;
  },
};
