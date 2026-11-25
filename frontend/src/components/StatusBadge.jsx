import { memo } from 'react';

const toneMap = {
  completed: 'ready',
  available: 'ready',
  assigned: 'active',
  dispatched: 'active',
  en_route: 'active',
  arrived: 'active',
  busy: 'warning',
  pending: 'warning',
  cancelled: 'attention',
  offline: 'attention',
  unassigned: 'attention'
};

const colorMap = {
  ready: { bg: '#d1fae5', text: '#065f46', dot: '#059669' },
  active: { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },
  warning: { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  attention: { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
  neutral: { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' }
};

export const StatusBadge = memo(function StatusBadge({ status, label, size = 'sm' }) {
  const normalized = String(status || 'unknown').toLowerCase();
  const tone = toneMap[normalized] || 'neutral';
  const colors = colorMap[tone];
  const display = label || normalized.replaceAll('_', ' ');

  const fontSize = size === 'xs' ? '11px' : size === 'sm' ? '12px' : '13px';
  const padding = size === 'xs' ? '2px 6px' : '3px 8px';
  const dotSize = size === 'xs' ? 6 : 7;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        backgroundColor: colors.bg,
        color: colors.text,
        fontSize,
        fontWeight: 600,
        padding,
        borderRadius: '20px',
        textTransform: 'capitalize',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap'
      }}
      title={display}
    >
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: colors.dot,
          flexShrink: 0,
          display: 'inline-block'
        }}
      />
      {display}
    </span>
  );
});
