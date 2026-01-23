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
  created_at: string;
  current_price: number | null;
  currency: string | null;
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

  create: (url: string, refreshInterval?: number) =>
    api.post<Product>('/products', { url, refresh_interval: refreshInterval }),

  update: (id: number, data: {
    name?: string;
    refresh_interval?: number;
    price_drop_threshold?: number | null;
    target_price?: number | null;
    notify_back_in_stock?: boolean;
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
  }) => api.put<NotificationSettings & { message: string }>('/settings/notifications', data),

  testTelegram: () =>
    api.post<{ message: string }>('/settings/notifications/test/telegram'),

  testDiscord: () =>
    api.post<{ message: string }>('/settings/notifications/test/discord'),

  testPushover: () =>
    api.post<{ message: string }>('/settings/notifications/test/pushover'),

  testNtfy: () =>
    api.post<{ message: string }>('/settings/notifications/test/ntfy'),

  // AI Settings
  getAI: () =>
    api.get<AISettings>('/settings/ai'),

  updateAI: (data: {
    ai_enabled?: boolean;
    ai_verification_enabled?: boolean;
    ai_provider?: 'anthropic' | 'openai' | 'ollama' | null;
    anthropic_api_key?: string | null;
    openai_api_key?: string | null;
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
  openai_api_key: string | null;
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
