import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../api/client';
import Sparkline from './Sparkline';
import AIStatusBadge from './AIStatusBadge';

interface ProductCardProps {
  product: Product;
  onDelete: (id: number) => void;
  onRefresh: (id: number) => Promise<void>;
  isSelected?: boolean;
  onSelect?: (id: number, selected: boolean) => void;
  showCheckbox?: boolean;
}

export default function ProductCard({ product, onDelete, onRefresh, isSelected, onSelect, showCheckbox }: ProductCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  // Calculate progress and time remaining using next_check_at from server
  useEffect(() => {
    const calculateProgress = () => {
      if (!product.next_check_at || !product.last_checked) {
        setProgress(100);
        setTimeRemaining('Soon');
        return;
      }

      const lastChecked = new Date(product.last_checked).getTime();
      const nextCheck = new Date(product.next_check_at).getTime();
      const now = Date.now();
      const totalDuration = nextCheck - lastChecked;
      const elapsed = now - lastChecked;
      const remaining = nextCheck - now;

      const progressPercent = totalDuration > 0
        ? Math.min((elapsed / totalDuration) * 100, 100)
        : 100;
      setProgress(progressPercent);

      // Trigger complete animation when reaching 100%
      if (progressPercent >= 100 && !isComplete) {
        setIsComplete(true);
        setTimeout(() => setIsComplete(false), 1500);
      }

      // Format time remaining
      if (remaining <= 0) {
        setTimeRemaining('Soon');
      } else {
        const seconds = Math.floor(remaining / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
          setTimeRemaining(`${hours}h ${minutes % 60}m`);
        } else if (minutes > 0) {
          setTimeRemaining(`${minutes}m ${seconds % 60}s`);
        } else {
          setTimeRemaining(`${seconds}s`);
        }
      }
    };

    calculateProgress();
    const interval = setInterval(calculateProgress, 1000);
    return () => clearInterval(interval);
  }, [product.last_checked, product.next_check_at, isComplete]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh(product.id);
    } finally {
      setIsRefreshing(false);
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

  const formatPriceChange = (change: number | null | undefined) => {
    if (change === null || change === undefined) return null;
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  };

  const truncateUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const priceChangeClass = product.price_change_7d
    ? product.price_change_7d < 0
      ? 'price-down'
      : product.price_change_7d > 0
      ? 'price-up'
      : ''
    : '';

  const isOutOfStock = product.stock_status === 'out_of_stock';

  // Check if current price is at or near historical low
  const isHistoricalLow = product.current_price && product.min_price &&
    product.current_price <= product.min_price;
  const isNearHistoricalLow = !isHistoricalLow && product.current_price && product.min_price &&
    product.current_price <= product.min_price * 1.05; // Within 5% of low

  const isPaused = product.checking_paused;

  return (
    <div className={`product-list-item ${isOutOfStock ? 'out-of-stock' : ''} ${isSelected ? 'selected' : ''} ${isPaused ? 'checking-paused' : ''}`}>
      <style>{`
        .product-list-item {
          position: relative;
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
          padding: 1rem;
          padding-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          transition: box-shadow 0.2s, transform 0.2s;
          overflow: hidden;
        }

        .product-list-item:hover {
          box-shadow: var(--shadow-lg);
          transform: translateY(-1px);
        }

        .product-list-item.selected {
          outline: 2px solid var(--primary);
          outline-offset: -2px;
        }

        .product-checkbox {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
          cursor: pointer;
          accent-color: var(--primary);
        }

        .product-thumbnail {
          width: 64px;
          height: 64px;
          border-radius: 0.5rem;
          object-fit: contain;
          background: #f8fafc;
          flex-shrink: 0;
        }

        [data-theme="dark"] .product-thumbnail {
          background: #334155;
        }

        .product-thumbnail-placeholder {
          width: 64px;
          height: 64px;
          border-radius: 0.5rem;
          background: linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        [data-theme="dark"] .product-thumbnail-placeholder {
          background: linear-gradient(135deg, #334155 0%, #475569 100%);
        }

        .product-info {
          flex: 1;
          min-width: 0;
        }

        .product-name {
          font-weight: 600;
          color: var(--text);
          font-size: 0.9375rem;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 0.25rem;
        }

        .product-source {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .product-notifications {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.375rem;
          flex-wrap: wrap;
        }

        .product-notification-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.6875rem;
          font-weight: 500;
          background: var(--background);
          color: var(--text-muted);
          border: 1px solid var(--border);
        }

        .product-notification-badge svg {
          width: 12px;
          height: 12px;
        }

        .product-price-section {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
          min-width: 80px;
        }

        .product-current-price {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--primary);
        }

        .product-price-change {
          font-size: 0.75rem;
          font-weight: 600;
        }

        .product-price-change.price-up {
          color: #ef4444;
        }

        .product-price-change.price-down {
          color: #10b981;
        }

        .product-stock-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .product-stock-badge.out-of-stock {
          background: #fef2f2;
          color: #dc2626;
        }

        [data-theme="dark"] .product-stock-badge.out-of-stock {
          background: rgba(220, 38, 38, 0.2);
          color: #f87171;
        }

        .product-stock-badge.historical-low {
          background: #ecfdf5;
          color: #059669;
        }

        [data-theme="dark"] .product-stock-badge.historical-low {
          background: rgba(5, 150, 105, 0.2);
          color: #34d399;
        }

        .product-stock-badge.near-low {
          background: #fef3c7;
          color: #d97706;
        }

        [data-theme="dark"] .product-stock-badge.near-low {
          background: rgba(217, 119, 6, 0.2);
          color: #fbbf24;
        }

        .product-list-item.out-of-stock {
          opacity: 0.7;
        }

        .product-list-item.out-of-stock .product-thumbnail {
          filter: grayscale(50%);
        }

        .product-list-item.checking-paused {
          opacity: 0.6;
        }

        .product-list-item.checking-paused .product-thumbnail {
          filter: grayscale(70%);
        }

        .paused-indicator {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.125rem 0.375rem;
          background: var(--border);
          color: var(--text-secondary);
          border-radius: 0.25rem;
          font-size: 0.6875rem;
          font-weight: 500;
          text-transform: uppercase;
        }

        .paused-indicator svg {
          width: 10px;
          height: 10px;
        }

        .product-sparkline {
          flex-shrink: 0;
        }

        .product-actions {
          display: flex;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .product-actions .btn {
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
        }

        .product-actions .btn-icon {
          padding: 0.5rem;
          min-width: unset;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .product-actions .btn-icon svg {
          width: 16px;
          height: 16px;
        }

        .product-actions .btn-icon.refreshing svg {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .product-list-item {
            flex-wrap: wrap;
          }

          .product-info {
            order: 1;
            flex-basis: calc(100% - 80px);
          }

          .product-thumbnail,
          .product-thumbnail-placeholder {
            order: 0;
          }

          .product-price-section {
            order: 2;
            flex-basis: auto;
          }

          .product-sparkline {
            order: 3;
            flex-basis: 100%;
            display: flex;
            justify-content: center;
            margin-top: 0.5rem;
          }

          .product-actions {
            order: 4;
            flex-basis: 100%;
            margin-top: 0.5rem;
          }

          .product-actions .btn {
            flex: 1;
          }
        }

        .product-progress-container {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--border);
          border-radius: 0 0 0.75rem 0.75rem;
          overflow: hidden;
        }

        .product-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #06b6d4, #10b981);
          border-radius: 0 0 0 0.75rem;
          transition: width 0.3s ease-out;
          position: relative;
        }

        .product-progress-bar::after {
          content: '';
          position: absolute;
          right: 0;
          top: -2px;
          bottom: -2px;
          width: 20px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6));
          filter: blur(3px);
          border-radius: 50%;
        }

        .product-progress-bar.complete {
          animation: progress-pulse 0.75s ease-in-out 2;
        }

        @keyframes progress-pulse {
          0%, 100% {
            box-shadow: 0 0 5px rgba(16, 185, 129, 0.5);
          }
          50% {
            box-shadow: 0 0 15px rgba(16, 185, 129, 0.8), 0 0 30px rgba(16, 185, 129, 0.4);
          }
        }

        .product-time-remaining {
          position: absolute;
          bottom: 8px;
          right: 8px;
          font-size: 0.625rem;
          color: var(--text-muted);
          background: var(--surface);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          opacity: 0.8;
          font-variant-numeric: tabular-nums;
        }
      `}</style>

      {showCheckbox && (
        <input
          type="checkbox"
          className="product-checkbox"
          checked={isSelected}
          onChange={(e) => onSelect?.(product.id, e.target.checked)}
        />
      )}

      {product.image_url ? (
        <img
          src={product.image_url}
          alt={product.name || 'Product'}
          className="product-thumbnail"
        />
      ) : (
        <div className="product-thumbnail-placeholder">📦</div>
      )}

      <div className="product-info">
        <h3 className="product-name">{product.name || 'Unknown Product'}</h3>
        <p className="product-source">{truncateUrl(product.url)}</p>
        {(product.price_drop_threshold || product.target_price || product.notify_back_in_stock) && (
          <div className="product-notifications">
            {product.price_drop_threshold && (
              <span className="product-notification-badge" title="Price drop alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                ${Number(product.price_drop_threshold).toFixed(2)} drop
              </span>
            )}
            {product.target_price && (
              <span className="product-notification-badge" title="Target price alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
                Target: ${Number(product.target_price).toFixed(2)}
              </span>
            )}
            {product.notify_back_in_stock && (
              <span className="product-notification-badge" title="Back in stock alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                Stock alert
              </span>
            )}
          </div>
        )}
      </div>

      <div className="product-price-section">
        {isOutOfStock ? (
          <span className="product-stock-badge out-of-stock">
            Out of Stock
          </span>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span className="product-current-price">
                {formatPrice(product.current_price, product.currency)}
              </span>
              <AIStatusBadge status={product.ai_status} size="small" />
            </div>
            {product.price_change_7d !== null && product.price_change_7d !== undefined && (
              <span className={`product-price-change ${priceChangeClass}`}>
                {formatPriceChange(product.price_change_7d)} (7d)
              </span>
            )}
            {isHistoricalLow && (
              <span className="product-stock-badge historical-low">
                Lowest Price
              </span>
            )}
            {isNearHistoricalLow && (
              <span className="product-stock-badge near-low">
                Near Low
              </span>
            )}
          </>
        )}
      </div>

      <div className="product-sparkline">
        <Sparkline
          data={product.sparkline || []}
          width={100}
          height={36}
          showTrend={false}
        />
      </div>

      <div className="product-actions">
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-icon"
          title="Open product page"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
        <button
          className={`btn btn-secondary btn-icon ${isRefreshing ? 'refreshing' : ''}`}
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh price"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
        </button>
        <Link to={`/product/${product.id}`} className="btn btn-primary">
          View
        </Link>
        <button
          className="btn btn-danger btn-icon"
          onClick={() => onDelete(product.id)}
          title="Delete"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="product-progress-container">
        <div
          className={`product-progress-bar ${isComplete ? 'complete' : ''}`}
          style={{ width: isPaused ? 0 : `${progress}%` }}
        />
      </div>
      {isPaused ? (
        <span className="paused-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          Paused
        </span>
      ) : (
        <span className="product-time-remaining">{timeRemaining}</span>
      )}
    </div>
  );
}
