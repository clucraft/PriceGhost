import { Link } from 'react-router-dom';
import { Product } from '../api/client';

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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const truncateUrl = (url: string, maxLength: number = 50) => {
    try {
      const parsed = new URL(url);
      const display = parsed.hostname + parsed.pathname;
      return display.length > maxLength
        ? display.slice(0, maxLength) + '...'
        : display;
    } catch {
      return url.length > maxLength ? url.slice(0, maxLength) + '...' : url;
    }
  };

  return (
    <div className="product-card">
      <style>{`
        .product-card {
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: box-shadow 0.2s;
        }

        .product-card:hover {
          box-shadow: var(--shadow-lg);
        }

        .product-image {
          width: 100%;
          height: 160px;
          object-fit: contain;
          background: #f8fafc;
          padding: 1rem;
        }

        .product-image-placeholder {
          width: 100%;
          height: 160px;
          background: linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          font-size: 2rem;
        }

        .product-content {
          padding: 1rem;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .product-name {
          font-weight: 600;
          color: var(--text);
          margin-bottom: 0.25rem;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .product-url {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 0.75rem;
        }

        .product-price {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--primary);
          margin-bottom: 0.5rem;
        }

        .product-meta {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 1rem;
        }

        .product-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: auto;
        }

        .product-actions .btn {
          flex: 1;
          padding: 0.5rem;
          font-size: 0.875rem;
        }
      `}</style>

      {product.image_url ? (
        <img
          src={product.image_url}
          alt={product.name || 'Product'}
          className="product-image"
        />
      ) : (
        <div className="product-image-placeholder">📦</div>
      )}

      <div className="product-content">
        <h3 className="product-name">{product.name || 'Unknown Product'}</h3>
        <p className="product-url">{truncateUrl(product.url)}</p>
        <div className="product-price">
          {formatPrice(product.current_price, product.currency)}
        </div>
        <p className="product-meta">
          Last checked: {formatDate(product.last_checked)}
        </p>

        <div className="product-actions">
          <Link to={`/product/${product.id}`} className="btn btn-primary">
            View Details
          </Link>
          <button
            className="btn btn-danger"
            onClick={() => onDelete(product.id)}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
