import { memo } from 'react';

export const LoadingState = memo(function LoadingState({ message = 'Loading...', size = 'md' }) {
  const spinnerSize = size === 'sm' ? 20 : size === 'lg' ? 48 : 32;
  return (
    <div className="loading-state" aria-busy="true" aria-label={message}>
      <div
        className="loading-spinner"
        style={{
          width: spinnerSize,
          height: spinnerSize,
          border: `${spinnerSize / 8}px solid #e2e8f0`,
          borderTopColor: '#1a56db',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          flexShrink: 0
        }}
      />
      <span style={{ color: '#64748b', fontSize: 14 }}>{message}</span>
    </div>
  );
});

export const ErrorState = memo(function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <span style={{ fontSize: 24 }}>⚠️</span>
      <p style={{ color: '#991b1b', margin: 0 }}>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
});

export const EmptyState = memo(function EmptyState({ icon = '📭', title, message }) {
  return (
    <div className="empty-state">
      <span style={{ fontSize: 40 }}>{icon}</span>
      {title && <strong>{title}</strong>}
      {message && <p style={{ color: '#64748b', margin: 0 }}>{message}</p>}
    </div>
  );
});
