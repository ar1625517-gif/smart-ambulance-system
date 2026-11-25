import { memo } from 'react';

/**
 * NotificationPanel - slide-in panel showing real-time emergency notifications
 */
export const NotificationPanel = memo(function NotificationPanel({
  notifications = [],
  connection = 'disconnected',
  onClose,
  onClear,
  alertMuted,
  onToggleMute,
  onRequestPermission,
  notificationPermission
}) {
  return (
    <aside className="notification-panel" aria-label="Emergency notifications">
      <div className="notification-panel-header">
        <div>
          <span className="eyebrow">ALERT CENTER</span>
          <h2>Emergency Notifications</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`connection-badge connection-${connection}`}>
            <span className="connection-dot" />
            {connection}
          </span>
          <button type="button" className="btn-icon" onClick={onToggleMute} title={alertMuted ? 'Unmute alerts' : 'Mute alerts'}>
            {alertMuted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close notifications">
            ✕
          </button>
        </div>
      </div>

      {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
        <button type="button" className="notification-permission-btn" onClick={onRequestPermission}>
          Enable browser notifications
        </button>
      )}

      {notifications.length > 0 ? (
        <>
          <div className="notification-list">
            {notifications.map((n, i) => (
              <article
                key={`${n.id}-${i}`}
                className={`notification-card notification-${n.type || 'info'}`}
              >
                <strong>{n.title}</strong>
                <p>{n.message}</p>
                <small>{new Date(n.createdAt).toLocaleTimeString()}</small>
              </article>
            ))}
          </div>
          {onClear && (
            <button type="button" className="btn btn-ghost btn-sm notification-clear" onClick={onClear}>
              Clear all
            </button>
          )}
        </>
      ) : (
        <div className="notification-empty">
          <span>🔔</span>
          <p>No new emergency alerts</p>
        </div>
      )}
    </aside>
  );
});
