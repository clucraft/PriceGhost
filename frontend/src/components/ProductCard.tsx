import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../api/client';
import Sparkline from './Sparkline';

interface ProductCardProps {
  product: Product;
  onDelete: (id: number) => void;
  onRefresh: (id: number) => Promise<void>;
}

export default function ProductCard({ product, onDelete, onRefresh }: ProductCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
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

  return (
    <div className={`product-list-item ${isOutOfStock ? 'out-of-stock' : ''}`}>
      <style>{`
        .product-list-item {
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
          padding: 1rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          transition: box-shadow 0.2s, transform 0.2s;
        }

        .product-list-item:hover {
          box-shadow: var(--shadow-lg);
          transform: translateY(-1px);
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

        .product-list-item.out-of-stock {
          opacity: 0.7;
        }

        .product-list-item.out-of-stock .product-thumbnail {
          filter: grayscale(50%);
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
      `}</style>

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
      </div>

      <div className="product-price-section">
        {isOutOfStock ? (
          <span className="product-stock-badge out-of-stock">
            Out of Stock
          </span>
        ) : (
          <>
            <span className="product-current-price">
              {formatPrice(product.current_price, product.currency)}
            </span>
            {product.price_change_7d !== null && product.price_change_7d !== undefined && (
              <span className={`product-price-change ${priceChangeClass}`}>
                {formatPriceChange(product.price_change_7d)} (7d)
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
    </div>
  );
}
