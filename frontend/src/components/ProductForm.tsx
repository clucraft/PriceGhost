import { useState, FormEvent } from 'react';

interface ProductFormProps {
  onSubmit: (url: string, refreshInterval: number) => Promise<void>;
}

const REFRESH_INTERVALS = [
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 7200, label: '2 hours' },
  { value: 21600, label: '6 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '24 hours' },
];

export default function ProductForm({ onSubmit }: ProductFormProps) {
  const [url, setUrl] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(3600);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate URL
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setIsLoading(true);

    try {
      await onSubmit(url, refreshInterval);
      setUrl('');
      setRefreshInterval(3600);
    } catch (err) {
      if (err instanceof Error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axiosError = err as any;
        setError(axiosError.response?.data?.error || 'Failed to add product');
      } else {
        setError('Failed to add product');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="product-form">
      <style>{`
        .product-form {
          background: var(--surface);
          border-radius: 0.75rem;
          padding: 1.5rem;
          box-shadow: var(--shadow);
          margin-bottom: 2rem;
        }

        .product-form h2 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
          color: var(--text);
        }

        .product-form-row {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr auto auto;
          align-items: end;
        }

        @media (max-width: 768px) {
          .product-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <h2>Track a New Product</h2>

      {error && <div className="alert alert-error mb-3">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="product-form-row">
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="product-url">Product URL</label>
            <input
              type="url"
              id="product-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.example.com/product"
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="refresh-interval">Check Every</label>
            <select
              id="refresh-interval"
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(parseInt(e.target.value, 10))}
            >
              {REFRESH_INTERVALS.map((interval) => (
                <option key={interval.value} value={interval.value}>
                  {interval.label}
                </option>
              ))}
            </select>
            {refreshInterval === 300 && (
              <small style={{ color: 'var(--warning)', marginTop: '0.25rem', display: 'block' }}>
                Warning: Very frequent checks may result in rate limiting
              </small>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ height: '46px' }}
          >
            {isLoading ? <span className="spinner" /> : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  );
}
