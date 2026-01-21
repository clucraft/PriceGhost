import { SparklinePoint } from '../api/client';

interface SparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  color?: string;
  showTrend?: boolean;
}

export default function Sparkline({
  data,
  width = 120,
  height = 40,
  color,
  showTrend = true,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div
        className="sparkline-empty"
        style={{ width, height }}
      >
        <style>{`
          .sparkline-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            font-size: 0.75rem;
            background: var(--surface-alt, #f1f5f9);
            border-radius: 4px;
          }
          [data-theme="dark"] .sparkline-empty {
            background: #334155;
          }
        `}</style>
        <span>No data</span>
      </div>
    );
  }

  const prices = data.map((d) =>
    typeof d.price === 'string' ? parseFloat(d.price) : d.price
  );
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  // Calculate trend
  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const trend = lastPrice < firstPrice ? 'down' : lastPrice > firstPrice ? 'up' : 'flat';

  // Determine color based on trend (green for down = good, red for up = bad for prices)
  const lineColor = color || (trend === 'down' ? '#10b981' : trend === 'up' ? '#ef4444' : '#6366f1');

  // Create SVG path
  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = prices.map((price, index) => {
    const x = padding + (index / (prices.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  // Create gradient fill path
  const fillPoints = [...points];
  fillPoints.push(`${padding + chartWidth},${padding + chartHeight}`);
  fillPoints.push(`${padding},${padding + chartHeight}`);
  const fillD = `M ${points.join(' L ')} L ${padding + chartWidth},${padding + chartHeight} L ${padding},${padding + chartHeight} Z`;

  return (
    <div className="sparkline-container">
      <style>{`
        .sparkline-container {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
        .sparkline-svg {
          display: block;
        }
        .sparkline-trend {
          font-size: 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .sparkline-trend.up {
          color: #ef4444;
        }
        .sparkline-trend.down {
          color: #10b981;
        }
        .sparkline-trend.flat {
          color: var(--text-muted);
        }
      `}</style>
      <svg
        className="sparkline-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id={`sparkline-gradient-${lineColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path
          d={fillD}
          fill={`url(#sparkline-gradient-${lineColor.replace('#', '')})`}
        />
        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={padding + chartWidth}
          cy={padding + chartHeight - ((lastPrice - minPrice) / priceRange) * chartHeight}
          r="3"
          fill={lineColor}
        />
      </svg>
      {showTrend && (
        <span className={`sparkline-trend ${trend}`}>
          {trend === 'down' && '↓'}
          {trend === 'up' && '↑'}
          {trend === 'flat' && '→'}
        </span>
      )}
    </div>
  );
}
