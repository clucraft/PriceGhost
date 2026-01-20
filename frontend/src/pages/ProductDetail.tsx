import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PriceChart from '../components/PriceChart';
import {
  productsApi,
  pricesApi,
  ProductWithStats,
  PriceHistory,
} from '../api/client';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<ProductWithStats | null>(null);
  const [prices, setPrices] = useState<PriceHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const productId = parseInt(id || '0', 10);

  const fetchData = async (days?: number) => {
    try {
      const [productRes, pricesRes] = await Promise.all([
        productsApi.getById(productId),
        pricesApi.getHistory(productId, days),
      ]);
      setProduct(productRes.data);
      setPrices(pricesRes.data.prices);
    } catch {
      setError('Failed to load product details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (productId) {
      fetchData(30);
    }
  }, [productId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await pricesApi.refresh(productId);
      await fetchData(30);
    } catch {
      alert('Failed to refresh price');
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
      alert('Failed to delete product');
    }
  };

  const handleRangeChange = (days: number | undefined) => {
    fetchData(days);
  };

  const formatPrice = (price: number | string | null, currency: string | null) => {
    if (price === null || price === undefined) return 'N/A';
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(numPrice)) return 'N/A';
    const currencySymbol =
      currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
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

            <div className="product-detail-price">
              {formatPrice(product.current_price, product.currency)}
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
                <span className="product-detail-meta-value">
                  {product.refresh_interval < 3600
                    ? `${product.refresh_interval / 60} minutes`
                    : `${product.refresh_interval / 3600} hour(s)`}
                </span>
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
    </Layout>
  );
}
