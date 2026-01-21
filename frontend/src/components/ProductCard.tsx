import { Link } from 'react-router-dom';
import { Product } from '../api/client';
import Sparkline from './Sparkline';

interface ProductCardProps {
  product: Product;
  onDelete: (id: number) => void;
}

export default function ProductCard({ product, onDelete }: ProductCardProps) {
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

  return (
    <div className="product-list-item">
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
        <span className="product-current-price">
          {formatPrice(product.current_price, product.currency)}
        </span>
        {product.price_change_7d !== null && product.price_change_7d !== undefined && (
          <span className={`product-price-change ${priceChangeClass}`}>
            {formatPriceChange(product.price_change_7d)} (7d)
          </span>
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
        <Link to={`/product/${product.id}`} className="btn btn-primary">
          View
        </Link>
        <button
          className="btn btn-danger"
          onClick={() => onDelete(product.id)}
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
