import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { PriceHistory } from '../api/client';

interface PriceChartProps {
  prices: PriceHistory[];
  currency: string;
  onRangeChange?: (days: number | undefined) => void;
}

const DATE_RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: undefined, label: 'All time' },
];

export default function PriceChart({
  prices,
  currency,
  onRangeChange,
}: PriceChartProps) {
  const [selectedRange, setSelectedRange] = useState<number | undefined>(30);

  const handleRangeChange = (days: number | undefined) => {
    setSelectedRange(days);
    onRangeChange?.(days);
  };

  const currencySymbol =
    currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  const chartData = prices.map((p) => ({
    date: new Date(p.recorded_at).getTime(),
    price: typeof p.price === 'string' ? parseFloat(p.price) : p.price,
  }));

  const priceValues = chartData.map((d) => d.price).filter((p) => !isNaN(p));
  const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : 0;
  const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : 0;
  const avgPrice = priceValues.length > 0
    ? priceValues.reduce((sum, p) => sum + p, 0) / priceValues.length
    : 0;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatPrice = (value: number) => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return `${currencySymbol}${value.toFixed(2)}`;
  };

  if (prices.length === 0) {
    return (
      <div className="price-chart-empty">
        <style>{`
          .price-chart-empty {
            background: var(--surface);
            border-radius: 0.75rem;
            padding: 3rem;
            text-align: center;
            color: var(--text-muted);
          }
        `}</style>
        <p>No price history available yet.</p>
      </div>
    );
  }

  return (
    <div className="price-chart">
      <style>{`
        .price-chart {
          background: var(--surface);
          border-radius: 0.75rem;
          padding: 1.5rem;
          box-shadow: var(--shadow);
        }

        .price-chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .price-chart-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text);
        }

        .price-chart-range {
          display: flex;
          gap: 0.5rem;
        }

        .price-chart-range button {
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--border);
          background: var(--surface);
          border-radius: 0.375rem;
          font-size: 0.875rem;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
        }

        .price-chart-range button:hover {
          border-color: var(--primary);
          color: var(--primary);
        }

        .price-chart-range button.active {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }

        .price-chart-container {
          height: 300px;
        }

        .price-chart-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }

        .price-stat {
          text-align: center;
        }

        .price-stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .price-stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 0.25rem;
        }

        .price-stat-value.min {
          color: var(--secondary);
        }

        .price-stat-value.max {
          color: var(--danger);
        }

        .price-stat-value.avg {
          color: var(--primary);
        }

        @media (max-width: 640px) {
          .price-chart-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="price-chart-header">
        <h3 className="price-chart-title">Price History</h3>
        <div className="price-chart-range">
          {DATE_RANGES.map((range) => (
            <button
              key={range.label}
              className={selectedRange === range.value ? 'active' : ''}
              onClick={() => handleRangeChange(range.value)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="price-chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#94a3b8"
              fontSize={12}
            />
            <YAxis
              tickFormatter={formatPrice}
              stroke="#94a3b8"
              fontSize={12}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(value: number) => [formatPrice(value), 'Price']}
              labelFormatter={(label) =>
                new Date(label).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }
              contentStyle={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
            />
            <ReferenceLine
              y={avgPrice}
              stroke="#6366f1"
              strokeDasharray="5 5"
              label=""
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ fill: '#6366f1', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, stroke: '#6366f1', strokeWidth: 2, fill: 'white' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="price-chart-stats">
        <div className="price-stat">
          <div className="price-stat-label">Lowest</div>
          <div className="price-stat-value min">{formatPrice(minPrice)}</div>
        </div>
        <div className="price-stat">
          <div className="price-stat-label">Average</div>
          <div className="price-stat-value avg">{formatPrice(avgPrice)}</div>
        </div>
        <div className="price-stat">
          <div className="price-stat-label">Highest</div>
          <div className="price-stat-value max">{formatPrice(maxPrice)}</div>
        </div>
      </div>
    </div>
  );
}
