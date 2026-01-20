import pool from './database';

const initDatabase = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created users table');

    // Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        name VARCHAR(255),
        image_url TEXT,
        refresh_interval INTEGER DEFAULT 3600,
        last_checked TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, url)
      );
    `);
    console.log('Created products table');

    // Create price_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        price DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Created price_history table');

    // Create index for price history queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_history_product_date
      ON price_history(product_id, recorded_at);
    `);
    console.log('Created price_history index');

    await client.query('COMMIT');
    console.log('Database initialization complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

initDatabase().catch(console.error);
