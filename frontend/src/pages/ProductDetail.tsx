import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PriceChart from '../components/PriceChart';
import StockTimeline from '../components/StockTimeline';
import AIStatusBadge from '../components/AIStatusBadge';
import { useToast } from '../context/ToastContext';
import {
  productsApi,
  pricesApi,
  settingsApi,
  ProductWithStats,
  PriceHistory,
  NotificationSettings,
} from '../api/client';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [product, setProduct] = useState<ProductWithStats | null>(null);
  const [prices, setPrices] = useState<PriceHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [error, setError] = useState('');
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [priceDropThreshold, setPriceDropThreshold] = useState<string>('');
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [notifyBackInStock, setNotifyBackInStock] = useState(false);
  const [aiVerificationDisabled, setAiVerificationDisabled] = useState(false);

  const REFRESH_INTERVALS = [
    { value: 300, label: '5 minutes' },
    { value: 600, label: '10 minutes' },
    { value: 900, label: '15 minutes' },
    { value: 1800, label: '30 minutes' },
    { value: 3600, label: '1 hour' },
    { value: 7200, label: '2 hours' },
    { value: 14400, label: '4 hours' },
    { value: 21600, label: '6 hours' },
    { value: 43200, label: '12 hours' },
    { value: 86400, label: '24 hours' },
  ];

  const productId = parseInt(id || '0', 10);

  const fetchData = async (days?: number) => {
    try {
      const [productRes, pricesRes] = await Promise.all([
        productsApi.getById(productId),
        pricesApi.getHistory(productId, days),
      ]);
      setProduct(productRes.data);
      setPrices(pricesRes.data.prices);
      // Initialize notification form fields from product data
      if (productRes.data.price_drop_threshold !== null && productRes.data.price_drop_threshold !== undefined) {
        setPriceDropThreshold(productRes.data.price_drop_threshold.toString());
      }
      if (productRes.data.target_price !== null && productRes.data.target_price !== undefined) {
        setTargetPrice(productRes.data.target_price.toString());
      }
      setNotifyBackInStock(productRes.data.notify_back_in_stock || false);
      setAiVerificationDisabled(productRes.data.ai_verification_disabled || false);
    } catch {
      setError('Failed to load product details');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotificationSettings = async () => {
    try {
      const response = await settingsApi.getNotifications();
      setNotificationSettings(response.data);
    } catch {
      // Silently fail - notifications just won't be shown
    }
  };

  useEffect(() => {
    if (productId) {
      fetchData(30);
      fetchNotificationSettings();
    }
  }, [productId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await pricesApi.refresh(productId);
      await fetchData(30);
      showToast('Price refreshed');
    } catch {
      showToast('Failed to refresh price', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to stop tracking this product?')) {
      return;
    }

    try {
      await productsApi.delete(productId);
      navigate('/');
    } catch {
      showToast('Failed to delete product', 'error');
    }
  };

  const handleRangeChange = (days: number | undefined) => {
    fetchData(days);
  };

  const handleRefreshIntervalChange = async (newInterval: number) => {
    if (!product) return;
    setIsSaving(true);
    try {
      await productsApi.update(productId, { refresh_interval: newInterval });
      setProduct({ ...product, refresh_interval: newInterval });
      showToast('Check interval updated');
    } catch {
      showToast('Failed to update refresh interval', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!product) return;
    setIsSavingNotifications(true);
    try {
      const threshold = priceDropThreshold ? parseFloat(priceDropThreshold) : null;
      const target = targetPrice ? parseFloat(targetPrice) : null;
      await productsApi.update(productId, {
        price_drop_threshold: threshold,
        target_price: target,
        notify_back_in_stock: notifyBackInStock,
        ai_verification_disabled: aiVerificationDisabled,
      });
      setProduct({
        ...product,
        price_drop_threshold: threshold,
        target_price: target,
        notify_back_in_stock: notifyBackInStock,
        ai_verification_disabled: aiVerificationDisabled,
      });
      showToast('Notification settings saved');
    } catch {
      showToast('Failed to save notification settings', 'error');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const formatPrice = (price: number | string | null, currency: string | null) => {
    if (price === null || price === undefined) return 'N/A';
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(numPrice)) return 'N/A';
    const currencySymbol =
      currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'CHF' ? 'CHF ' : '$';
    return `${currencySymbol}${numPrice.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <Layout>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4rem',
          }}
        >
          <span className="spinner" style={{ width: '3rem', height: '3rem' }} />
        </div>
      </Layout>
    );
  }

  if (error || !product) {
    return (
      <Layout>
        <div className="alert alert-error">{error || 'Product not found'}</div>
        <Link to="/" className="btn btn-secondary mt-3">
          Back to Dashboard
        </Link>
      </Layout>
    );
  }

  const priceChange = (() => {
    if (!product.stats || prices.length < 1) return null;
    const currentPrice = typeof product.current_price === 'string'
      ? parseFloat(product.current_price)
      : (product.current_price || 0);
    const firstPrice = typeof prices[0].price === 'string'
      ? parseFloat(prices[0].price)
      : prices[0].price;
    if (firstPrice === 0) return null;
    return (currentPrice - firstPrice) / firstPrice;
  })();

  return (
    <Layout>
      <style>{`
        .product-detail-header {
          margin-bottom: 2rem;
        }

        .product-detail-back {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-muted);
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .product-detail-back:hover {
          color: var(--primary);
          text-decoration: none;
        }

        .product-detail-card {
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .product-detail-content {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 2rem;
        }

        @media (max-width: 768px) {
          .product-detail-content {
            grid-template-columns: 1fr;
          }
        }

        .product-detail-image {
          width: 200px;
          height: 200px;
          object-fit: contain;
          background: #f8fafc;
          border-radius: 0.5rem;
        }

        .product-detail-image-placeholder {
          width: 200px;
          height: 200px;
          background: linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%);
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4rem;
        }

        .product-detail-info {
          flex: 1;
        }

        .product-detail-name {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 0.5rem;
        }

        .product-detail-url {
          font-size: 0.875rem;
          color: var(--text-muted);
          word-break: break-all;
          margin-bottom: 1.5rem;
        }

        .product-detail-price {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--primary);
          margin-bottom: 0.5rem;
        }

        .product-detail-change {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .product-detail-change.up {
          background: #fef2f2;
          color: #dc2626;
        }

        .product-detail-change.down {
          background: #f0fdf4;
          color: #16a34a;
        }

        .product-detail-stock-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .product-detail-stock-badge.out-of-stock {
          background: #fef2f2;
          color: #dc2626;
        }

        [data-theme="dark"] .product-detail-stock-badge.out-of-stock {
          background: rgba(220, 38, 38, 0.2);
          color: #f87171;
        }

        .product-detail-stock-badge.in-stock {
          background: #f0fdf4;
          color: #16a34a;
        }

        [data-theme="dark"] .product-detail-stock-badge.in-stock {
          background: rgba(22, 163, 74, 0.2);
          color: #4ade80;
        }

        .product-detail-meta {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          font-size: 0.875rem;
        }

        .product-detail-meta-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .product-detail-meta-label {
          color: var(--text-muted);
        }

        .product-detail-meta-value {
          font-weight: 500;
          color: var(--text);
        }

        .product-detail-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }

        .product-detail-meta-select {
          padding: 0.375rem 0.5rem;
          border: 1px solid var(--border);
          border-radius: 0.375rem;
          background: var(--surface);
          color: var(--text);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .product-detail-meta-select:hover {
          border-color: var(--primary);
        }

        .product-detail-meta-select:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
        }

        .product-detail-meta-select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>

      <div className="product-detail-header">
        <Link to="/" className="product-detail-back">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="product-detail-card">
        <div className="product-detail-content">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name || 'Product'}
              className="product-detail-image"
            />
          ) : (
            <div className="product-detail-image-placeholder">📦</div>
          )}

          <div className="product-detail-info">
            <h1 className="product-detail-name">
              {product.name || 'Unknown Product'}
            </h1>
            <p className="product-detail-url">
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {product.url}
              </a>
            </p>

            {product.stock_status === 'out_of_stock' ? (
              <div className="product-detail-stock-badge out-of-stock">
                <span>⚠</span> Currently Unavailable
              </div>
            ) : product.stock_status === 'in_stock' ? (
              <div className="product-detail-stock-badge in-stock">
                <span>✓</span> In Stock
              </div>
            ) : null}

            <div className="product-detail-price" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>
                {product.stock_status === 'out_of_stock'
                  ? 'Price unavailable'
                  : formatPrice(product.current_price, product.currency)}
              </span>
              {product.stock_status !== 'out_of_stock' && (
                <AIStatusBadge status={product.ai_status} />
              )}
            </div>

            {priceChange !== null && priceChange !== 0 && (
              <span
                className={`product-detail-change ${priceChange > 0 ? 'up' : 'down'}`}
              >
                {priceChange > 0 ? '↑' : '↓'}{' '}
                {Math.abs(priceChange * 100).toFixed(1)}% since tracking started
              </span>
            )}

            <div className="product-detail-meta">
              <div className="product-detail-meta-item">
                <span className="product-detail-meta-label">Last Checked</span>
                <span className="product-detail-meta-value">
                  {product.last_checked
                    ? new Date(product.last_checked).toLocaleString()
                    : 'Never'}
                </span>
              </div>
              <div className="product-detail-meta-item">
                <span className="product-detail-meta-label">Check Interval</span>
                <select
                  className="product-detail-meta-select"
                  value={product.refresh_interval}
                  onChange={(e) => handleRefreshIntervalChange(parseInt(e.target.value, 10))}
                  disabled={isSaving}
                >
                  {REFRESH_INTERVALS.map((interval) => (
                    <option key={interval.value} value={interval.value}>
                      {interval.label}
                    </option>
                  ))}
                </select>
                {product.refresh_interval === 300 && (
                  <small style={{ color: 'var(--warning)', marginTop: '0.25rem', display: 'block', fontSize: '0.75rem' }}>
                    Warning: May cause rate limiting
                  </small>
                )}
              </div>
              <div className="product-detail-meta-item">
                <span className="product-detail-meta-label">Tracking Since</span>
                <span className="product-detail-meta-value">
                  {new Date(product.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="product-detail-meta-item">
                <span className="product-detail-meta-label">Price Records</span>
                <span className="product-detail-meta-value">
                  {product.stats?.price_count || 0}
                </span>
              </div>
            </div>

            <div className="product-detail-actions">
              <button
                className="btn btn-primary"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <span className="spinner" />
                ) : (
                  'Refresh Price Now'
                )}
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Stop Tracking
              </button>
            </div>
          </div>
        </div>
      </div>

      <PriceChart
        prices={prices}
        currency={product.currency || 'USD'}
        onRangeChange={handleRangeChange}
      />

      <StockTimeline productId={productId} days={30} />

      {notificationSettings && (
        ((notificationSettings.telegram_bot_token && notificationSettings.telegram_chat_id) && notificationSettings.telegram_enabled) ||
        (notificationSettings.discord_webhook_url && notificationSettings.discord_enabled) ||
        ((notificationSettings.pushover_user_key && notificationSettings.pushover_app_token) && notificationSettings.pushover_enabled) ||
        (notificationSettings.ntfy_topic && notificationSettings.ntfy_enabled)
      ) && (
        <>
          <style>{`
            .notification-settings-card {
              background: var(--surface);
              border-radius: 0.75rem;
              box-shadow: var(--shadow);
              padding: 1.5rem;
              margin-top: 2rem;
            }

            .notification-settings-header {
              display: flex;
              align-items: center;
              gap: 0.75rem;
              margin-bottom: 1rem;
            }

            .notification-settings-icon {
              font-size: 1.5rem;
            }

            .notification-settings-title {
              font-size: 1.125rem;
              font-weight: 600;
              color: var(--text);
            }

            .notification-settings-channels {
              display: flex;
              gap: 0.5rem;
              margin-left: auto;
            }

            .notification-channel-badge {
              padding: 0.25rem 0.5rem;
              border-radius: 0.25rem;
              font-size: 0.75rem;
              font-weight: 600;
              background: #f0fdf4;
              color: #16a34a;
            }

            [data-theme="dark"] .notification-channel-badge {
              background: rgba(22, 163, 74, 0.2);
              color: #4ade80;
            }

            .notification-settings-description {
              color: var(--text-muted);
              font-size: 0.875rem;
              margin-bottom: 1.5rem;
              line-height: 1.5;
            }

            .notification-form-row {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 1.5rem;
              margin-bottom: 1rem;
            }

            @media (max-width: 640px) {
              .notification-form-row {
                grid-template-columns: 1fr;
              }
            }

            .notification-form-group {
              display: flex;
              flex-direction: column;
              gap: 0.375rem;
            }

            .notification-form-group label {
              font-size: 0.875rem;
              font-weight: 500;
              color: var(--text);
            }

            .notification-form-group input[type="number"] {
              padding: 0.625rem 0.75rem;
              border: 1px solid var(--border);
              border-radius: 0.375rem;
              background: var(--background);
              color: var(--text);
              font-size: 0.875rem;
            }

            .notification-form-group input[type="number"]:focus {
              outline: none;
              border-color: var(--primary);
              box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
            }

            .notification-form-group .hint {
              font-size: 0.75rem;
              color: var(--text-muted);
            }

            .notification-checkbox-group {
              display: flex;
              align-items: center;
              gap: 0.75rem;
              padding: 0.75rem;
              background: var(--background);
              border-radius: 0.375rem;
              cursor: pointer;
            }

            .notification-checkbox-group:hover {
              background: var(--border);
            }

            .notification-checkbox-group input[type="checkbox"] {
              width: 1.125rem;
              height: 1.125rem;
              accent-color: var(--primary);
              cursor: pointer;
            }

            .notification-checkbox-label {
              display: flex;
              flex-direction: column;
              gap: 0.125rem;
            }

            .notification-checkbox-label span:first-child {
              font-size: 0.875rem;
              font-weight: 500;
              color: var(--text);
            }

            .notification-checkbox-label span:last-child {
              font-size: 0.75rem;
              color: var(--text-muted);
            }

            .notification-form-actions {
              margin-top: 1rem;
            }
          `}</style>

          <div className="notification-settings-card">
            <div className="notification-settings-header">
              <span className="notification-settings-icon">🔔</span>
              <h2 className="notification-settings-title">Notification Settings</h2>
              <div className="notification-settings-channels">
                {(notificationSettings.telegram_bot_token && notificationSettings.telegram_chat_id) && notificationSettings.telegram_enabled && (
                  <span className="notification-channel-badge">Telegram</span>
                )}
                {notificationSettings.discord_webhook_url && notificationSettings.discord_enabled && (
                  <span className="notification-channel-badge">Discord</span>
                )}
                {(notificationSettings.pushover_user_key && notificationSettings.pushover_app_token) && notificationSettings.pushover_enabled && (
                  <span className="notification-channel-badge">Pushover</span>
                )}
                {notificationSettings.ntfy_topic && notificationSettings.ntfy_enabled && (
                  <span className="notification-channel-badge">ntfy</span>
                )}
              </div>
            </div>
            <p className="notification-settings-description">
              Configure alerts for this product. When triggered, notifications will be sent to <strong>all</strong> your
              configured channels shown above.
            </p>

            <div className="notification-form-row">
              <div className="notification-form-group">
                <label>Price Drop Threshold</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceDropThreshold}
                  onChange={(e) => setPriceDropThreshold(e.target.value)}
                  placeholder="Enter amount (e.g., 5.00)"
                />
                <span className="hint">
                  Notify when price drops by at least this amount ({product.currency || 'USD'})
                </span>
              </div>

              <div className="notification-form-group">
                <label>Target Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="Enter target price (e.g., 49.99)"
                />
                <span className="hint">
                  Notify when price drops to or below this amount ({product.currency || 'USD'})
                </span>
              </div>
            </div>

            <div className="notification-form-row">
              <div className="notification-form-group">
                <label>Back in Stock Alert</label>
                <label className="notification-checkbox-group">
                  <input
                    type="checkbox"
                    checked={notifyBackInStock}
                    onChange={(e) => setNotifyBackInStock(e.target.checked)}
                  />
                  <div className="notification-checkbox-label">
                    <span>Enable back-in-stock notifications</span>
                    <span>Get notified when this item becomes available</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="notification-form-actions">
              <button
                className="btn btn-primary"
                onClick={handleSaveNotifications}
                disabled={isSavingNotifications}
              >
                {isSavingNotifications ? 'Saving...' : 'Save Notification Settings'}
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        .advanced-settings-card {
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
          padding: 1.5rem;
          margin-top: 2rem;
        }

        .advanced-settings-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .advanced-settings-icon {
          font-size: 1.5rem;
        }

        .advanced-settings-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text);
        }

        .advanced-settings-description {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .advanced-checkbox-group {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: var(--background);
          border-radius: 0.375rem;
          cursor: pointer;
        }

        .advanced-checkbox-group:hover {
          background: var(--border);
        }

        .advanced-checkbox-group input[type="checkbox"] {
          width: 1.125rem;
          height: 1.125rem;
          accent-color: var(--primary);
          cursor: pointer;
        }

        .advanced-checkbox-label {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .advanced-checkbox-label span:first-child {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text);
        }

        .advanced-checkbox-label span:last-child {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .advanced-settings-actions {
          margin-top: 1rem;
        }
      `}</style>

      <div className="advanced-settings-card">
        <div className="advanced-settings-header">
          <span className="advanced-settings-icon">⚙️</span>
          <h2 className="advanced-settings-title">Advanced Settings</h2>
        </div>
        <p className="advanced-settings-description">
          Fine-tune how price extraction works for this product.
        </p>

        <label className="advanced-checkbox-group">
          <input
            type="checkbox"
            checked={aiVerificationDisabled}
            onChange={(e) => setAiVerificationDisabled(e.target.checked)}
          />
          <div className="advanced-checkbox-label">
            <span>Disable AI Verification</span>
            <span>Prevent AI from "correcting" the scraped price. Useful when AI keeps picking the wrong price (e.g., main price instead of other sellers on Amazon).</span>
          </div>
        </label>

        <div className="advanced-settings-actions">
          <button
            className="btn btn-primary"
            onClick={handleSaveNotifications}
            disabled={isSavingNotifications}
          >
            {isSavingNotifications ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
