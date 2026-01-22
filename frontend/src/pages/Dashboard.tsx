import { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import ProductForm from '../components/ProductForm';
import { productsApi, pricesApi, Product } from '../api/client';

type SortOption = 'date_added' | 'name' | 'price' | 'price_change' | 'website';
type SortOrder = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date_added', label: 'Date Added' },
  { value: 'name', label: 'Product Name' },
  { value: 'price', label: 'Price' },
  { value: 'price_change', label: 'Price Change (7d)' },
  { value: 'website', label: 'Website' },
];

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem('dashboard_sort_by');
    return (saved as SortOption) || 'date_added';
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const saved = localStorage.getItem('dashboard_sort_order');
    return (saved as SortOrder) || 'desc';
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);

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

  useEffect(() => {
    localStorage.setItem('dashboard_sort_by', sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('dashboard_sort_order', sortOrder);
  }, [sortOrder]);

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

  const handleSelectProduct = (id: number, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedProducts.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} product${selectedIds.size > 1 ? 's' : ''}?`)) {
      return;
    }

    setIsDeleting(true);
    setShowBulkActions(false);
    try {
      await Promise.all(Array.from(selectedIds).map(id => productsApi.delete(id)));
      setProducts(prev => prev.filter(p => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
    } catch {
      alert('Failed to delete some products');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkEnablePriceAlert = async () => {
    const threshold = prompt('Enter price drop threshold (e.g., 5.00):');
    if (!threshold) return;
    const value = parseFloat(threshold);
    if (isNaN(value) || value <= 0) {
      alert('Please enter a valid positive number');
      return;
    }

    setIsSavingBulk(true);
    setShowBulkActions(false);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          productsApi.update(id, { price_drop_threshold: value })
        )
      );
      setProducts(prev =>
        prev.map(p =>
          selectedIds.has(p.id) ? { ...p, price_drop_threshold: value } : p
        )
      );
      setSelectedIds(new Set());
    } catch {
      alert('Failed to update some products');
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleBulkEnableStockAlert = async () => {
    if (!confirm(`Enable stock alerts for ${selectedIds.size} product${selectedIds.size > 1 ? 's' : ''}?`)) {
      return;
    }

    setIsSavingBulk(true);
    setShowBulkActions(false);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          productsApi.update(id, { notify_back_in_stock: true })
        )
      );
      setProducts(prev =>
        prev.map(p =>
          selectedIds.has(p.id) ? { ...p, notify_back_in_stock: true } : p
        )
      );
      setSelectedIds(new Set());
    } catch {
      alert('Failed to update some products');
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleBulkSetTargetPrice = async () => {
    const target = prompt('Enter target price (e.g., 49.99):');
    if (!target) return;
    const value = parseFloat(target);
    if (isNaN(value) || value <= 0) {
      alert('Please enter a valid positive number');
      return;
    }

    setIsSavingBulk(true);
    setShowBulkActions(false);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          productsApi.update(id, { target_price: value })
        )
      );
      setProducts(prev =>
        prev.map(p =>
          selectedIds.has(p.id) ? { ...p, target_price: value } : p
        )
      );
      setSelectedIds(new Set());
    } catch {
      alert('Failed to update some products');
    } finally {
      setIsSavingBulk(false);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setShowBulkActions(false);
  };

  const getWebsite = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  // Dashboard summary calculations
  const dashboardSummary = useMemo(() => {
    if (products.length === 0) return null;

    const totalProducts = products.length;

    // Find biggest drops this week (negative price_change_7d)
    const biggestDrops = products
      .filter(p => p.price_change_7d && p.price_change_7d < 0)
      .sort((a, b) => (a.price_change_7d || 0) - (b.price_change_7d || 0))
      .slice(0, 3);

    // Find products at or below target price
    const atTargetPrice = products.filter(p =>
      p.target_price && p.current_price &&
      parseFloat(String(p.current_price)) <= parseFloat(String(p.target_price))
    );

    // Find products at historical low
    const atHistoricalLow = products.filter(p =>
      p.current_price && p.min_price &&
      parseFloat(String(p.current_price)) <= parseFloat(String(p.min_price))
    );

    return {
      totalProducts,
      biggestDrops,
      atTargetPrice,
      atHistoricalLow,
    };
  }, [products]);

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.url.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date_added':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'price': {
          const priceA = typeof a.current_price === 'string' ? parseFloat(a.current_price) : (a.current_price || 0);
          const priceB = typeof b.current_price === 'string' ? parseFloat(b.current_price) : (b.current_price || 0);
          comparison = priceA - priceB;
          break;
        }
        case 'price_change':
          comparison = (a.price_change_7d || 0) - (b.price_change_7d || 0);
          break;
        case 'website':
          comparison = getWebsite(a.url).localeCompare(getWebsite(b.url));
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [products, searchQuery, sortBy, sortOrder]);

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

        .sort-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .sort-select {
          padding: 0.75rem 2rem 0.75rem 0.875rem;
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          background: var(--surface);
          color: var(--text);
          font-size: 0.9375rem;
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.75rem center;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .sort-select:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .sort-order-btn {
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }

        .sort-order-btn:hover {
          background: var(--background);
          border-color: var(--primary);
        }

        .sort-order-btn:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .sort-order-btn svg {
          width: 16px;
          height: 16px;
          transition: transform 0.2s;
        }

        .sort-order-btn.desc svg {
          transform: rotate(180deg);
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

        .dashboard-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .summary-card {
          background: var(--surface);
          border-radius: 0.75rem;
          box-shadow: var(--shadow);
          padding: 1rem;
        }

        .summary-card-title {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
        }

        .summary-card-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text);
        }

        .summary-card-value.highlight {
          color: var(--primary);
        }

        .summary-card-value.success {
          color: #10b981;
        }

        .summary-card-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .summary-card-list li {
          font-size: 0.8125rem;
          color: var(--text);
          padding: 0.25rem 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .summary-card-list li span.drop {
          color: #10b981;
          font-weight: 600;
        }

        .bulk-action-bar {
          position: fixed;
          bottom: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1.25rem;
          background: var(--surface);
          color: var(--text);
          border-radius: 0.75rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border);
          z-index: 100;
        }

        .bulk-action-bar .selected-count {
          font-weight: 600;
          color: var(--primary);
        }

        .bulk-action-bar .bulk-actions {
          display: flex;
          gap: 0.5rem;
          position: relative;
        }

        .bulk-action-bar .btn {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }

        .bulk-actions-dropdown {
          position: absolute;
          bottom: calc(100% + 0.5rem);
          right: 0;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          min-width: 200px;
          overflow: hidden;
        }

        .bulk-actions-dropdown button {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem 1rem;
          border: none;
          background: none;
          color: var(--text);
          font-size: 0.875rem;
          cursor: pointer;
          text-align: left;
        }

        .bulk-actions-dropdown button:hover {
          background: var(--background);
        }

        .bulk-actions-dropdown button.danger {
          color: #dc2626;
        }

        .bulk-actions-dropdown button.danger:hover {
          background: #fef2f2;
        }

        [data-theme="dark"] .bulk-actions-dropdown button.danger:hover {
          background: rgba(220, 38, 38, 0.1);
        }

        .bulk-actions-dropdown svg {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        .bulk-actions-dropdown hr {
          margin: 0;
          border: none;
          border-top: 1px solid var(--border);
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

      {/* Dashboard Summary */}
      {!isLoading && dashboardSummary && dashboardSummary.totalProducts > 0 && (
        <div className="dashboard-summary">
          <div className="summary-card">
            <div className="summary-card-title">Total Products</div>
            <div className="summary-card-value">{dashboardSummary.totalProducts}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-title">At Lowest Price</div>
            <div className={`summary-card-value ${dashboardSummary.atHistoricalLow.length > 0 ? 'success' : ''}`}>
              {dashboardSummary.atHistoricalLow.length}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-card-title">At Target Price</div>
            <div className={`summary-card-value ${dashboardSummary.atTargetPrice.length > 0 ? 'highlight' : ''}`}>
              {dashboardSummary.atTargetPrice.length}
            </div>
          </div>
          {dashboardSummary.biggestDrops.length > 0 && (
            <div className="summary-card">
              <div className="summary-card-title">Biggest Drops (7d)</div>
              <ul className="summary-card-list">
                {dashboardSummary.biggestDrops.map(p => (
                  <li key={p.id}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
                      {p.name?.slice(0, 20) || 'Unknown'}
                    </span>
                    <span className="drop">{p.price_change_7d?.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
          <div className="sort-controls">
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className={`sort-order-btn ${sortOrder}`}
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span className="selected-count">{selectedIds.size} selected</span>
          <button className="btn btn-secondary btn-sm" onClick={handleSelectAll}>
            {selectedIds.size === filteredAndSortedProducts.length ? 'Deselect All' : 'Select All'}
          </button>
          <div className="bulk-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowBulkActions(!showBulkActions)}
              disabled={isDeleting || isSavingBulk}
            >
              {isDeleting || isSavingBulk ? 'Working...' : 'Actions ▾'}
            </button>
            {showBulkActions && (
              <div className="bulk-actions-dropdown">
                <button onClick={handleBulkEnablePriceAlert}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Set Price Drop Alert
                </button>
                <button onClick={handleBulkSetTargetPrice}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                  Set Target Price
                </button>
                <button onClick={handleBulkEnableStockAlert}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  Enable Stock Alerts
                </button>
                <hr />
                <button className="danger" onClick={handleBulkDelete}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                  Delete Selected
                </button>
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={clearSelection}>
              Clear
            </button>
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
      ) : filteredAndSortedProducts.length === 0 ? (
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
            {filteredAndSortedProducts.length === products.length
              ? `${products.length} product${products.length !== 1 ? 's' : ''}`
              : `${filteredAndSortedProducts.length} of ${products.length} products`}
          </p>
          <div className="products-list">
            {filteredAndSortedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onDelete={handleDeleteProduct}
                onRefresh={handleRefreshProduct}
                showCheckbox={true}
                isSelected={selectedIds.has(product.id)}
                onSelect={handleSelectProduct}
              />
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
