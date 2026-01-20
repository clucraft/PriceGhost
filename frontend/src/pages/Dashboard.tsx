import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import ProductForm from '../components/ProductForm';
import { productsApi, Product } from '../api/client';

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <Layout>
      <style>{`
        .dashboard-header {
          margin-bottom: 2rem;
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

        .products-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
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
      ) : (
        <div className="products-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onDelete={handleDeleteProduct}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}
