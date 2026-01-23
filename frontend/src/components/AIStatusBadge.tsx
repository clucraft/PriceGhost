import { AIStatus } from '../api/client';

interface AIStatusBadgeProps {
  status: AIStatus;
  size?: 'small' | 'normal';
}

export default function AIStatusBadge({ status, size = 'normal' }: AIStatusBadgeProps) {
  if (!status) return null;

  const isSmall = size === 'small';
  const fontSize = isSmall ? '0.65rem' : '0.75rem';
  const padding = isSmall ? '0.1rem 0.3rem' : '0.15rem 0.4rem';

  if (status === 'verified') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.2rem',
          fontSize,
          padding,
          borderRadius: '0.25rem',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          fontWeight: 500,
        }}
        title="AI verified this price is correct"
      >
        <span style={{ fontSize: isSmall ? '0.7rem' : '0.8rem' }}>✓</span>
        AI
      </span>
    );
  }

  if (status === 'corrected') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.2rem',
          fontSize,
          padding,
          borderRadius: '0.25rem',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          color: '#f59e0b',
          fontWeight: 500,
        }}
        title="AI corrected this price (original scrape was incorrect)"
      >
        <span style={{ fontSize: isSmall ? '0.7rem' : '0.8rem' }}>⚡</span>
        AI
      </span>
    );
  }

  return null;
}
