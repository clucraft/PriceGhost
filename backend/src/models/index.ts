import pool from '../config/database';

// User types and queries
export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
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
};

// Product types and queries
export interface Product {
  id: number;
  user_id: number;
  url: string;
  name: string | null;
  image_url: string | null;
  refresh_interval: number;
  last_checked: Date | null;
  created_at: Date;
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
    refreshInterval: number = 3600
  ): Promise<Product> => {
    const result = await pool.query(
      `INSERT INTO products (user_id, url, name, image_url, refresh_interval)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, url, name, imageUrl, refreshInterval]
    );
    return result.rows[0];
  },

  update: async (
    id: number,
    userId: number,
    updates: { name?: string; refresh_interval?: number }
  ): Promise<Product | null> => {
    const fields: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.refresh_interval !== undefined) {
      fields.push(`refresh_interval = $${paramIndex++}`);
      values.push(updates.refresh_interval);
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

  updateLastChecked: async (id: number): Promise<void> => {
    await pool.query(
      'UPDATE products SET last_checked = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  },

  findDueForRefresh: async (): Promise<Product[]> => {
    const result = await pool.query(
      `SELECT * FROM products
       WHERE last_checked IS NULL
       OR last_checked + (refresh_interval || ' seconds')::interval < CURRENT_TIMESTAMP`
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
