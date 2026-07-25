import { MigrationContext } from '../config/migrate';

export const up = async ({ context: pool }: { context: MigrationContext }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add use_browser_scraper column with default false
    await client.query(`
      ALTER TABLE public.retailer_configs 
      ADD COLUMN IF NOT EXISTS use_browser_scraper boolean DEFAULT false;
    `);

    // 2. Consolidate flags: set use_browser_scraper to true if any of the three old flags is true
    await client.query(`
      UPDATE public.retailer_configs 
      SET use_browser_scraper = (
        COALESCE(use_browser, false) OR 
        COALESCE(is_js_heavy, false) OR 
        COALESCE(use_remote_scraper, false)
      );
    `);

    // 3. Drop old columns
    await client.query(`
      ALTER TABLE public.retailer_configs 
      DROP COLUMN IF EXISTS use_browser,
      DROP COLUMN IF EXISTS is_js_heavy,
      DROP COLUMN IF EXISTS use_remote_scraper;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const down = async ({ context: pool }: { context: MigrationContext }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Re-add old columns
    await client.query(`
      ALTER TABLE public.retailer_configs 
      ADD COLUMN IF NOT EXISTS use_browser boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_js_heavy boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS use_remote_scraper boolean DEFAULT false;
    `);

    // 2. Restore flags from consolidated flag
    await client.query(`
      UPDATE public.retailer_configs 
      SET use_browser = use_browser_scraper,
          is_js_heavy = use_browser_scraper,
          use_remote_scraper = use_browser_scraper;
    `);

    // 3. Drop consolidated column
    await client.query(`
      ALTER TABLE public.retailer_configs 
      DROP COLUMN IF EXISTS use_browser_scraper;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
