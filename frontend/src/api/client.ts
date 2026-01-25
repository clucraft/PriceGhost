import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (email: string, password: string) =>
    api.post('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  getRegistrationStatus: () =>
    api.get<{ registration_enabled: boolean }>('/auth/registration-status'),
};

// Products API
export type StockStatus = 'in_stock' | 'out_of_stock' | 'unknown';
export type AIStatus = 'verified' | 'corrected' | null;

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
  created_at: string;
  current_price: number | null;
  currency: string | null;
  ai_status: AIStatus;
  sparkline?: SparklinePoint[];
  price_change_7d?: number | null;
  min_price?: number | null;
}

export interface ProductWithStats extends Product {
  stats: {
    min_price: number;
    max_price: number;
    avg_price: number;
    price_count: number;
  } | null;
}

// Response when product needs price review
export interface PriceCandidate {
  price: number;
  currency: string;
  method: string;
  context?: string;
  confidence: number;
}

export interface PriceReviewResponse {
  needsReview: true;
  name: string | null;
  imageUrl: string | null;
  stockStatus: string;
  priceCandidates: PriceCandidate[];
  suggestedPrice: { price: number; currency: string } | null;
  url: string;
}

export type CreateProductResponse = Product | PriceReviewResponse;

export interface PriceHistory {
  id: number;
  product_id: number;
  price: number;
  currency: string;
  recorded_at: string;
}

export const productsApi = {
  getAll: () => api.get<Product[]>('/products'),

  getById: (id: number) => api.get<ProductWithStats>(`/products/${id}`),

  create: (url: string, refreshInterval?: number, selectedPrice?: number, selectedMethod?: string) =>
    api.post<CreateProductResponse>('/products', {
      url,
      refresh_interval: refreshInterval,
      selectedPrice,
      selectedMethod,
    }),

  update: (id: number, data: {
    name?: string;
    refresh_interval?: number;
    price_drop_threshold?: number | null;
    target_price?: number | null;
    notify_back_in_stock?: boolean;
    ai_verification_disabled?: boolean;
    ai_extraction_disabled?: boolean;
  }) => api.put<Product>(`/products/${id}`, data),

  delete: (id: number) => api.delete(`/products/${id}`),
};

// Prices API
export const pricesApi = {
  getHistory: (productId: number, days?: number) =>
    api.get<{ product: Product; prices: PriceHistory[] }>(
      `/products/${productId}/prices`,
      { params: days ? { days } : undefined }
    ),

  refresh: (productId: number) =>
    api.post<{ message: string; price: PriceHistory }>(
      `/products/${productId}/refresh`
    ),
};

// Stock Status History API
export interface StockStatusHistoryEntry {
  id: number;
  product_id: number;
  status: StockStatus;
  changed_at: string;
}

export interface StockStatusStats {
  availability_percent: number;
  outage_count: number;
  avg_outage_days: number | null;
  longest_outage_days: number | null;
  current_status: StockStatus;
  days_in_current_status: number;
}

export const stockHistoryApi = {
  getHistory: (productId: number, days?: number) =>
    api.get<{ history: StockStatusHistoryEntry[]; stats: StockStatusStats | null }>(
      `/products/${productId}/stock-history`,
      { params: days ? { days } : undefined }
    ),
};

// Settings API
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
  ntfy_enabled: boolean;
  gotify_url: string | null;
  gotify_app_token: string | null;
  gotify_enabled: boolean;
}

export const settingsApi = {
  getNotifications: () =>
    api.get<NotificationSettings>('/settings/notifications'),

  updateNotifications: (data: {
    telegram_bot_token?: string | null;
    telegram_chat_id?: string | null;
    telegram_enabled?: boolean;
    discord_webhook_url?: string | null;
    discord_enabled?: boolean;
    pushover_user_key?: string | null;
    pushover_app_token?: string | null;
    pushover_enabled?: boolean;
    ntfy_topic?: string | null;
    ntfy_enabled?: boolean;
    gotify_url?: string | null;
    gotify_app_token?: string | null;
    gotify_enabled?: boolean;
  }) => api.put<NotificationSettings & { message: string }>('/settings/notifications', data),

  testTelegram: () =>
    api.post<{ message: string }>('/settings/notifications/test/telegram'),

  testDiscord: () =>
    api.post<{ message: string }>('/settings/notifications/test/discord'),

  testPushover: () =>
    api.post<{ message: string }>('/settings/notifications/test/pushover'),

  testNtfy: () =>
    api.post<{ message: string }>('/settings/notifications/test/ntfy'),

  testGotifyConnection: (url: string, appToken: string) =>
    api.post<{ success: boolean; message?: string; error?: string }>('/settings/notifications/test-gotify', {
      url,
      app_token: appToken,
    }),

  testGotify: () =>
    api.post<{ message: string }>('/settings/notifications/test/gotify'),

  // AI Settings
  getAI: () =>
    api.get<AISettings>('/settings/ai'),

  updateAI: (data: {
    ai_enabled?: boolean;
    ai_verification_enabled?: boolean;
    ai_provider?: 'anthropic' | 'openai' | 'ollama' | null;
    anthropic_api_key?: string | null;
    anthropic_model?: string | null;
    openai_api_key?: string | null;
    openai_model?: string | null;
    ollama_base_url?: string | null;
    ollama_model?: string | null;
  }) => api.put<AISettings & { message: string }>('/settings/ai', data),

  testAI: (url: string) =>
    api.post<AITestResult>('/settings/ai/test', { url }),

  testOllama: (baseUrl: string) =>
    api.post<OllamaTestResult>('/settings/ai/test-ollama', { base_url: baseUrl }),
};

// AI Settings types
export interface AISettings {
  ai_enabled: boolean;
  ai_verification_enabled: boolean;
  ai_provider: 'anthropic' | 'openai' | 'ollama' | null;
  anthropic_api_key: string | null;
  anthropic_model: string | null;
  openai_api_key: string | null;
  openai_model: string | null;
  ollama_base_url: string | null;
  ollama_model: string | null;
}

export interface OllamaTestResult {
  success: boolean;
  message?: string;
  error?: string;
  models?: string[];
}

export interface AITestResult {
  success: boolean;
  name: string | null;
  price: { price: number; currency: string } | null;
  imageUrl: string | null;
  stockStatus: string;
  confidence: number;
}

// Profile API
export interface UserProfile {
  id: number;
  email: string;
  name: string | null;
  is_admin: boolean;
  created_at: string;
}

export const profileApi = {
  get: () => api.get<UserProfile>('/profile'),

  update: (data: { name?: string }) =>
    api.put<UserProfile>('/profile', data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ message: string }>('/profile/password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};

// Notification History API
export type NotificationType = 'price_drop' | 'price_target' | 'stock_change';

export interface NotificationHistoryEntry {
  id: number;
  user_id: number;
  product_id: number;
  notification_type: NotificationType;
  triggered_at: string;
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

export interface NotificationHistoryResponse {
  notifications: NotificationHistoryEntry[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface RecentNotificationsResponse {
  notifications: NotificationHistoryEntry[];
  recentCount: number;
}

export const notificationsApi = {
  getRecent: (limit?: number) =>
    api.get<RecentNotificationsResponse>('/notifications/recent', {
      params: limit ? { limit } : undefined,
    }),

  getHistory: (page?: number, limit?: number) =>
    api.get<NotificationHistoryResponse>('/notifications/history', {
      params: { page: page || 1, limit: limit || 20 },
    }),

  getCount: (hours?: number) =>
    api.get<{ count: number }>('/notifications/count', {
      params: hours ? { hours } : undefined,
    }),

  clear: () =>
    api.post<{ message: string }>('/notifications/clear'),
};

// Admin API
export interface SystemSettings {
  registration_enabled: string;
}

export const adminApi = {
  getUsers: () => api.get<UserProfile[]>('/admin/users'),

  createUser: (email: string, password: string, isAdmin: boolean) =>
    api.post<{ message: string; user: UserProfile }>('/admin/users', {
      email,
      password,
      is_admin: isAdmin,
    }),

  deleteUser: (id: number) => api.delete(`/admin/users/${id}`),

  setUserAdmin: (id: number, isAdmin: boolean) =>
    api.put(`/admin/users/${id}/admin`, { is_admin: isAdmin }),

  getSettings: () => api.get<SystemSettings>('/admin/settings'),

  updateSettings: (data: { registration_enabled?: boolean }) =>
    api.put<SystemSettings>('/admin/settings', data),
};

export default api;
