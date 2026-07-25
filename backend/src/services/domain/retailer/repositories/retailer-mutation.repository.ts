import pool from '../../../../config/database';
import { RetailerConfig } from '../../../../models/types';

export const retailerMutationRepository = {
  delete: async (id: number): Promise<boolean> => {
    const result = await pool.query('DELETE FROM retailer_configs WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  },

  upsert: async (config: Partial<RetailerConfig> & { forceNameRemoval?: boolean }, client?: any): Promise<RetailerConfig> => {
    const executor = client || pool;
    const domain = config.domain?.toLowerCase();
    const result = await executor.query(
      `INSERT INTO retailer_configs (
         domain, name, status, status_history, use_proxy, use_browser_scraper, currency_hint, 
         name_selectors, price_selectors, deal_price_selectors, member_price_selectors, image_selectors, stock_selectors,
         in_stock_phrases, out_of_stock_phrases, pre_order_phrases, pre_order_price_selectors, user_agent, custom_selectors, active, description,
         retailer_name_selectors, jsonld_image_key, jsonld_price_key, jsonld_name_key, original_price_selectors, ai_selectors, exclusion_selectors,
         selector_metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
       ON CONFLICT (domain) DO UPDATE SET
         name = CASE 
           WHEN $30 = true THEN EXCLUDED.name 
           WHEN retailer_configs.name = INITCAP(SPLIT_PART(retailer_configs.domain, '.', 1)) THEN COALESCE(NULLIF(EXCLUDED.name, ''), retailer_configs.name)
           ELSE COALESCE(retailer_configs.name, NULLIF(EXCLUDED.name, '')) 
         END,
         status_history = CASE 
           WHEN EXCLUDED.status IS NOT NULL AND (retailer_configs.status IS NULL OR EXCLUDED.status != retailer_configs.status)
           THEN jsonb_path_query_array(
                  jsonb_insert(
                    COALESCE(retailer_configs.status_history, '[]'::jsonb), 
                    '{0}', 
                    jsonb_build_object('status', EXCLUDED.status, 'timestamp', CURRENT_TIMESTAMP)
                  ),
                  '$[0 to 9]'
                )
           ELSE retailer_configs.status_history 
         END,
         status = COALESCE(EXCLUDED.status, retailer_configs.status),
         use_proxy = COALESCE(EXCLUDED.use_proxy, retailer_configs.use_proxy),
         use_browser_scraper = COALESCE(EXCLUDED.use_browser_scraper, retailer_configs.use_browser_scraper),
         currency_hint = COALESCE(EXCLUDED.currency_hint, retailer_configs.currency_hint),
         name_selectors = CASE WHEN EXCLUDED.name_selectors = '[]'::jsonb THEN retailer_configs.name_selectors ELSE EXCLUDED.name_selectors END,
         retailer_name_selectors = CASE WHEN EXCLUDED.retailer_name_selectors = '[]'::jsonb THEN retailer_configs.retailer_name_selectors ELSE EXCLUDED.retailer_name_selectors END,
         price_selectors = CASE WHEN EXCLUDED.price_selectors = '[]'::jsonb THEN retailer_configs.price_selectors ELSE EXCLUDED.price_selectors END,
         deal_price_selectors = CASE WHEN EXCLUDED.deal_price_selectors = '[]'::jsonb THEN retailer_configs.deal_price_selectors ELSE EXCLUDED.deal_price_selectors END,
         member_price_selectors = CASE WHEN EXCLUDED.member_price_selectors = '[]'::jsonb THEN retailer_configs.member_price_selectors ELSE EXCLUDED.member_price_selectors END,
         image_selectors = CASE WHEN EXCLUDED.image_selectors = '[]'::jsonb THEN retailer_configs.image_selectors ELSE EXCLUDED.image_selectors END,
         stock_selectors = CASE WHEN EXCLUDED.stock_selectors = '[]'::jsonb THEN retailer_configs.stock_selectors ELSE EXCLUDED.stock_selectors END,
         in_stock_phrases = CASE WHEN EXCLUDED.in_stock_phrases = '[]'::jsonb THEN retailer_configs.in_stock_phrases ELSE EXCLUDED.in_stock_phrases END,
         out_of_stock_phrases = CASE WHEN EXCLUDED.out_of_stock_phrases = '[]'::jsonb THEN retailer_configs.out_of_stock_phrases ELSE EXCLUDED.out_of_stock_phrases END,
         pre_order_phrases = CASE WHEN EXCLUDED.pre_order_phrases = '[]'::jsonb THEN retailer_configs.pre_order_phrases ELSE EXCLUDED.pre_order_phrases END,
         pre_order_price_selectors = CASE WHEN EXCLUDED.pre_order_price_selectors = '[]'::jsonb THEN retailer_configs.pre_order_price_selectors ELSE EXCLUDED.pre_order_price_selectors END,
         user_agent = COALESCE(EXCLUDED.user_agent, retailer_configs.user_agent),
         custom_selectors = CASE WHEN EXCLUDED.custom_selectors = '{}'::jsonb THEN retailer_configs.custom_selectors ELSE EXCLUDED.custom_selectors END,
         active = COALESCE(EXCLUDED.active, retailer_configs.active),
         description = COALESCE(EXCLUDED.description, retailer_configs.description),
         jsonld_image_key = COALESCE(EXCLUDED.jsonld_image_key, retailer_configs.jsonld_image_key),
         jsonld_price_key = COALESCE(EXCLUDED.jsonld_price_key, retailer_configs.jsonld_price_key),
         jsonld_name_key = COALESCE(EXCLUDED.jsonld_name_key, retailer_configs.jsonld_name_key),
         original_price_selectors = CASE WHEN EXCLUDED.original_price_selectors = '[]'::jsonb THEN retailer_configs.original_price_selectors ELSE EXCLUDED.original_price_selectors END,
         ai_selectors = COALESCE(EXCLUDED.ai_selectors, retailer_configs.ai_selectors),
         exclusion_selectors = CASE WHEN EXCLUDED.exclusion_selectors = '[]'::jsonb THEN retailer_configs.exclusion_selectors ELSE EXCLUDED.exclusion_selectors END,
         selector_metadata = COALESCE(EXCLUDED.selector_metadata, retailer_configs.selector_metadata),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        domain,
        config.name || null,
        config.status || null,
        JSON.stringify(config.status_history || (config.status ? [{ status: config.status, timestamp: new Date().toISOString() }] : [])),
        config.use_proxy !== undefined ? config.use_proxy : null,
        config.use_browser_scraper !== undefined ? config.use_browser_scraper : null,
        config.currency_hint || null,
        JSON.stringify(config.name_selectors || []),
        JSON.stringify(config.price_selectors || []),
        JSON.stringify(config.deal_price_selectors || []),
        JSON.stringify(config.member_price_selectors || []),
        JSON.stringify(config.image_selectors || []),
        JSON.stringify(config.stock_selectors || []),
        JSON.stringify(config.in_stock_phrases || []),
        JSON.stringify(config.out_of_stock_phrases || []),
        JSON.stringify(config.pre_order_phrases || []),
        JSON.stringify(config.pre_order_price_selectors || []),
        config.user_agent || null,
        JSON.stringify(config.custom_selectors || {}),
        config.active !== undefined ? config.active : null,
        config.description || null,
        JSON.stringify(config.retailer_name_selectors || []),
        config.jsonld_image_key || null,
        config.jsonld_price_key || null,
        config.jsonld_name_key || null,
        JSON.stringify(config.original_price_selectors || []),
        config.ai_selectors ? JSON.stringify(config.ai_selectors) : null,
        JSON.stringify(config.exclusion_selectors || []),
        JSON.stringify(config.selector_metadata || {}),
        config.forceNameRemoval ?? false
      ]
    );
    return result.rows[0];
  }
};
