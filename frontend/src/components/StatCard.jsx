import { memo } from 'react';

export const StatCard = memo(function StatCard({ label, value, sub, icon, color = '#1a56db', onClick }) {
  return (
    <article
      className="stat-card"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="stat-card-header">
        {icon && (
          <span className="stat-card-icon" style={{ color }}>
            {icon}
          </span>
        )}
        <span className="stat-card-label">{label}</span>
      </div>
      <strong className="stat-card-value" style={{ color }}>{value ?? '—'}</strong>
      {sub && <small className="stat-card-sub">{sub}</small>}
    </article>
  );
});
