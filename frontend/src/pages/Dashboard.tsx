import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import ProductForm from '../components/ProductForm';
import { productsApi, pricesApi, Product } from '../api/client';

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchProducts = async () => {
    try {
      const response = await productsApi.getAll();
      setProducts(response.data);
    } catch {
      setError('Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddProduct = async (url: string, refreshInterval: number) => {
    const response = await productsApi.create(url, refreshInterval);
    setProducts((prev) => [response.data, ...prev]);
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Are you sure you want to stop tracking this product?')) {
      return;
    }

    try {
      await productsApi.delete(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Failed to delete product');
    }
  };

  const handleRefreshProduct = async (id: number) => {
    try {
      await pricesApi.refresh(id);
      // Refresh the products list to get updated data
      await fetchProducts();
    } catch {
      alert('Failed to refresh price');
    }
  };

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(query) ||
        p.url.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  return (
    <Layout>
      <style>{`
        .dashboard-header {
          margin-bottom: 1.5rem;
        }

        .dashboard-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text);
        }

        .dashboard-subtitle {
          color: var(--text-muted);
          margin-top: 0.25rem;
        }

        .dashboard-controls {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .search-container {
          flex: 1;
          min-width: 200px;
          max-width: 400px;
          position: relative;
        }

        .search-icon {
          position: absolute;
          left: 0.875rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          padding: 0.75rem 0.875rem 0.75rem 2.5rem;
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          background: var(--surface);
          color: var(--text);
          font-size: 0.9375rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .search-input::placeholder {
          color: var(--text-muted);
        }

        .products-count {
          color: var(--text-muted);
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .products-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
        }

        .empty-state-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .empty-state-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 0.5rem;
        }

        .empty-state-text {
          color: var(--text-muted);
        }

        .no-results {
          text-align: center;
          padding: 3rem 2rem;
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
        }

        .no-results-icon {
          font-size: 2.5rem;
          margin-bottom: 0.75rem;
        }

        .no-results-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 0.25rem;
        }

        .no-results-text {
          color: var(--text-muted);
          font-size: 0.875rem;
        }

        .loading-state {
          display: flex;
          justify-content: center;
          padding: 4rem;
        }
      `}</style>

      <div className="dashboard-header">
        <h1 className="dashboard-title">Your Tracked Products</h1>
        <p className="dashboard-subtitle">
          Monitor prices and get notified when they drop
        </p>
      </div>

      <ProductForm onSubmit={handleAddProduct} />

      {error && <div className="alert alert-error">{error}</div>}

      {!isLoading && products.length > 0 && (
        <div className="dashboard-controls">
          <div className="search-container">
            <span className="search-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="7" cy="7" r="5" />
                <path d="M13 13L11 11" />
              </svg>
            </span>
            <input
              type="text"
              className="search-input"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="loading-state">
          <span className="spinner" style={{ width: '3rem', height: '3rem' }} />
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h2 className="empty-state-title">No products yet</h2>
          <p className="empty-state-text">
            Add your first product URL above to start tracking prices!
          </p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="no-results">
          <div className="no-results-icon">🔍</div>
          <h3 className="no-results-title">No matching products</h3>
          <p className="no-results-text">
            Try adjusting your search query
          </p>
        </div>
      ) : (
        <>
          <p className="products-count">
            {filteredProducts.length === products.length
              ? `${products.length} product${products.length !== 1 ? 's' : ''}`
              : `${filteredProducts.length} of ${products.length} products`}
          </p>
          <div className="products-list">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onDelete={handleDeleteProduct}
                onRefresh={handleRefreshProduct}
              />
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
