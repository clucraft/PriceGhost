export type StockStatus = 'in_stock' | 'out_of_stock' | 'pre_order' | 'not_available' | 'member_only' | 'unknown';
export type AIStatus = 'verified' | 'corrected' | 'confirmed' | null;

export interface SparklinePoint {
  price: number;
  recorded_at: string;
}

export interface Product {
  id: number;
  user_id: number;
  url: string;
  name: string | null;
  image_url: string | null;
  refresh_interval: number;
  last_checked: string | null;
  next_check_at: string | null;
  stock_status: StockStatus;
  price_drop_threshold: number | null;
  target_price: number | null;
  notify_back_in_stock: boolean;
  ai_verification_disabled: boolean;
  ai_extraction_disabled: boolean;
  checking_paused: boolean;
  category: string | null;
  created_at: string;
  current_price: number | null;
  member_price: number | null;
  original_price: number | null;
  currency: string | null;
  converted_price: number | null;
  converted_currency: string | null;
  ai_status: AIStatus;
  price_type?: 'standard' | 'member-price' | 'deal-price' | 'pre-order' | null;
  preferred_extraction_method?: string | null;
  sparkline?: SparklinePoint[];
  price_change_7d?: number | null;
  min_price?: number | null;
  retailer_name?: string | null;
}

export interface ProductWithStats extends Product {
  stats: {
    min_price: number;
    max_price: number;
    avg_price: number;
    price_count: number;
  };
}

export interface PriceCandidate {
  price: number;
  currency: string;
  method: string;
  context?: string;
  confidence: number;
  selector?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  domain: string;
  isSupported: boolean;
}

export type ReviewReason = 'no_consensus' | 'ai_correction' | 'oos_guardrail' | 'manual_rescan' | 'first_scan';

export interface PriceReviewResponse {
  needsReview: true;
  name: string | null;
  imageUrl: string | null;
  stockStatus: string;
  priceCandidates: PriceCandidate[];
  reviewReason: ReviewReason;
  url: string;
  category?: string | null;
  html?: string | null;
}

export type CreateProductResponse = Product | PriceReviewResponse;

export interface PriceHistory {
  id: number;
  product_id: number;
  price: number;
  currency: string;
  ai_status: AIStatus;
  recorded_at: string;
  price_type?: 'standard' | 'member-price' | 'original-price' | 'deal-price' | 'pre-order' | null;
}

export interface ProductSourceHistory {
  id: number;
  product_id: number;
  stock_status: StockStatus;
  recorded_at: string;
  status?: StockStatus;
  changed_at?: string;
}

export type StockStatusHistoryEntry = ProductSourceHistory;

export interface StockStatusStats {
  in_stock_count: number;
  out_of_stock_count: number;
  pre_order_count: number;
  not_available_count: number;
  unknown_count: number;
  availability_percent?: number;
  outage_count?: number;
  avg_outage_days?: number | null;
  longest_outage_days?: number | null;
  current_status?: StockStatus;
  days_in_current_status?: number;
}

export interface NotificationEntry {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  data: any;
  created_at: string;
}

export interface CreateNotification {
  type: string;
  title: string;
  message: string;
  data?: any;
}

export interface UserProfile {
  id: number;
  email: string;
  name: string | null;
  currency: string;
  locale: string;
  preferred_currency: string;
  is_admin: boolean;
  disabled: boolean;
  categories: string[];
  created_at: string;
}

export interface NotificationSettings {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_enabled: boolean;
  telegram_message_template: string | null;
  discord_webhook_url: string | null;
  discord_enabled: boolean;
  discord_message_template: string | null;
  pushover_user_key: string | null;
  pushover_app_token: string | null;
  pushover_enabled: boolean;
  pushover_message_template: string | null;
  ntfy_topic: string | null;
  ntfy_server_url: string | null;
  ntfy_username: string | null;
  ntfy_password: string | null;
  ntfy_enabled: boolean;
  ntfy_message_template: string | null;
  gotify_url: string | null;
  gotify_app_token: string | null;
  gotify_enabled: boolean;
  gotify_message_template: string | null;
  webhook_url: string | null;
  webhook_headers: string | null;
  webhook_payload_template: string | null;
  webhook_enabled: boolean;
  email_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number;
  email_from: string | null;
  email_to: string | null;
  email_subject_template: string | null;
  email_body_template: string | null;
}

export interface RetailerConfig {
  id: number;
  domain: string;
  name: string | null;
  status: string | null;
  use_proxy: boolean;
  use_browser_scraper: boolean;
  currency_hint: string | null;
  name_selectors: string[];
  retailer_name_selectors: string[];
  price_selectors: string[];
  deal_price_selectors: string[];
  original_price_selectors: string[];
  member_price_selectors: string[];
  image_selectors: string[];
  stock_selectors: string[];
  price_regex: string[];
  name_regex: string[];
  image_regex: string[];
  in_stock_phrases: string[];
  out_of_stock_phrases: string[];
  pre_order_phrases: string[];
  pre_order_price_selectors: string[];
  exclusion_selectors: string[];
  jsonld_image_key: string | null;
  jsonld_price_key: string | null;
  jsonld_name_key: string | null;
  user_agent: string | null;
  referrer: string | null;
  custom_selectors: any;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  forceNameRemoval?: boolean;
  skip_denoising?: boolean;
  ai_selectors?: { price?: string[]; image?: string[] } | null;
}

export interface SystemSettings {
  registration_enabled: boolean | string;
  debug_page_enabled?: boolean | string;
  scheduler_disabled?: boolean | string;
  retailer_updates_disabled?: boolean | string;
  browser_timeout?: number;
  browser_delay?: number;
  scraper_proxy?: string;
  remote_scraper_url?: string;
  default_user_agent?: string;
  default_referrer?: string;
  searxng_url?: string;
  searxng_enabled?: boolean | string;
  generic_price_selectors?: string;
  generic_retailer_name_selectors?: string;
  generic_deal_price_selectors?: string;
  generic_member_price_selectors?: string;
  generic_pre_order_price_selectors?: string;
  generic_original_price_selectors?: string;
  generic_name_selectors?: string;
  generic_image_selectors?: string;
  generic_stock_selectors?: string;
  generic_exclusion_selectors?: string;
  generic_in_stock_phrases?: string;
  generic_out_of_stock_phrases?: string;
  generic_pre_order_phrases?: string;
  prefer_jsonld_image?: boolean | string;
  jsonld_name_key?: string;
  jsonld_image_key?: string;
  jsonld_price_key?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AISettings {
  ai_enabled: boolean;
  ai_verification_enabled: boolean;
  ai_auto_mapping_enabled: boolean;
  ai_provider: 'anthropic' | 'openai' | 'ollama' | 'gemini' | 'deepseek' | 'groq' | 'mistral' | 'vertex' | null;
  anthropic_api_key: string | null;
  anthropic_model: string | null;
  openai_api_key: string | null;
  openai_model: string | null;
  ollama_base_url: string | null;
  ollama_model: string | null;
  gemini_api_key: string | null;
  gemini_model: string | null;
  vertex_project_id: string | null;
  vertex_location: string | null;
  vertex_api_key: string | null;
  vertex_model: string | null;
  deepseek_api_key: string | null;
  deepseek_model: string | null;
  groq_api_key: string | null;
  groq_model: string | null;
  mistral_api_key: string | null;
  mistral_model: string | null;
  ai_timeout?: number;
  ai_max_retries?: number;
  redact_api_keys?: boolean;
}

export interface GlobalCurrency {
  id: number;
  country_territory: string;
  currency_name: string;
  iso: string;
  symbol: string;
  locale: string;
  separation: string;
  position: string;
}

export interface SystemApiToken {
  id: number;
  admin_id: number | null;
  label: string;
  description: string | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

export interface CreateSystemApiTokenResponse {
  message: string;
  token: string;
  systemToken: SystemApiToken;
}

export interface TestRetailerConfigResult {
  success: boolean;
  name?: string | null;
  price?: {
    price: number;
    currency: string;
  } | null;
  imageUrl?: string | null;
  stockStatus?: string;
  error?: string;
  priceCandidates?: PriceCandidate[];
}
