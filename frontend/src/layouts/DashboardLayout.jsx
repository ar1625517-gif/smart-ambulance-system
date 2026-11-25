import { memo, useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';

export const DashboardLayout = memo(function DashboardLayout({
  user,
  onLogout,
  currentTab,
  onTabChange,
  socketStatus = 'connected',
  notificationsCount = 0,
  onOpenNotifications,
  alertMuted,
  onToggleMute,
  children
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = user?.role || 'control_room';

  // Navigation items filtered by role
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'control_room'] },
    { id: 'emergency', label: 'Emergency SOS', icon: '🚨', roles: ['admin', 'control_room'] },
    { id: 'tracking', label: 'Live Tracking', icon: '🗺️', roles: ['admin', 'control_room'] },
    { id: 'ambulances', label: 'Ambulances', icon: '🚑', roles: ['admin', 'control_room'] },
    { id: 'hospitals', label: 'Hospitals', icon: '🏥', roles: ['admin', 'control_room'] },
    { id: 'driver', label: 'My Assignment', icon: '📍', roles: ['admin', 'driver'] },
    { id: 'hospital_staff', label: 'Hospital Incoming', icon: '🩺', roles: ['admin', 'hospital_staff'] },
    { id: 'analytics', label: 'Analytics & Logs', icon: '📈', roles: ['admin'] }
  ].filter((item) => item.roles.includes(role));

  const handleNavClick = (tabId) => {
    onTabChange(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`app-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="app-sidebar-header">
          <div className="brand-logo">
            <span className="brand-icon">🚑</span>
            <div>
              <span className="brand-title">MediRoute</span>
              <span className="brand-subtitle">Smart Emergency</span>
            </div>
          </div>
          <button
            type="button"
            className="mobile-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <div className="user-badge-mini">
          <div className="user-avatar">{user?.username?.[0]?.toUpperCase() || 'U'}</div>
          <div className="user-info">
            <strong>{user?.displayName || user?.username}</strong>
            <StatusBadge status={user?.role === 'admin' ? 'completed' : 'assigned'} label={user?.role} size="xs" />
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${currentTab === item.id ? 'active' : ''}`}
              onClick={() => handleNavClick(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-text">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status-indicator">
            <span className={`status-dot dot-${socketStatus}`} />
            <span>Socket: {socketStatus}</span>
          </div>
          <button type="button" className="btn-logout" onClick={onLogout}>
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-wrapper">
        <header className="app-topbar">
          <button
            type="button"
            className="hamburger-btn"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="topbar-title">
            <span>EMERGENCY DISPATCH CENTER</span>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-btn mute-btn"
              onClick={onToggleMute}
              title={alertMuted ? 'Unmute siren alert' : 'Mute siren alert'}
            >
              {alertMuted ? '🔇' : '🔊'}
            </button>

            <button
              type="button"
              className="topbar-btn notification-badge-btn"
              onClick={onOpenNotifications}
              title="Emergency Notifications"
            >
              🔔
              {notificationsCount > 0 && <span className="notification-bubble">{notificationsCount}</span>}
            </button>

            <div className="topbar-user">
              <span className="user-name">{user?.displayName || user?.username}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onLogout}>
                Exit
              </button>
            </div>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
});
