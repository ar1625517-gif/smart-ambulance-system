import { memo, useState, useEffect, useCallback } from 'react';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/LoadingState';
import { dispatchApi, managementApi } from '../services/api';

export const ControlRoomDashboard = memo(function ControlRoomDashboard({
  token,
  onSelectRequest,
  onNavigateTab
}) {
  const [stats, setStats] = useState(null);
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Real world sync state
  const [syncCity, setSyncCity] = useState('Bangalore');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await dispatchApi.dashboard();
      setStats(data.stats);
      setRecentRequests(data.recentRequests || []);
    } catch (err) {
      setError(err.message || 'Unable to connect to dispatch server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      if (!document.hidden) loadData();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleSyncRealWorld = async (e) => {
    e.preventDefault();
    if (!token) return;
    setSyncLoading(true);
    setSyncError('');
    setSyncMessage('');

    try {
      const result = await managementApi.syncRealWorld(token, { city: syncCity });
      setSyncMessage(`✓ Synced ${result.hospitalsCount} live hospitals and deployed ${result.ambulancesCount} ambulances!`);
      await loadData();
    } catch (err) {
      setSyncError(err.message || 'Failed to sync real-world data.');
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="dashboard-page">
      {/* Intro Header */}
      <section className="dispatch-intro">
        <span className="eyebrow">OPERATIONAL OVERVIEW</span>
        <h1>Control Room Command Center</h1>
        <p>Real-time dispatch status, emergency queues, and live hospital resource metrics.</p>
      </section>

      {/* KPI Stats */}
      {loading && !stats && <LoadingState message="Connecting to telemetry and loading dashboard metrics..." />}

      {error && <ErrorState message={error} onRetry={loadData} />}

      {stats && (
        <section className="dispatch-stat-grid" aria-label="Dispatch metrics">
          <StatCard
            label="Active Trips"
            value={stats.active_trips}
            sub="Dispatched / En Route / Arrived"
            icon="🚑"
            color="#1a56db"
            onClick={() => onNavigateTab?.('tracking')}
          />
          <StatCard
            label="Ambulances Ready"
            value={stats.available_ambulances}
            sub={`${stats.busy_ambulances || 0} currently busy`}
            icon="✅"
            color="#057a55"
            onClick={() => onNavigateTab?.('ambulances')}
          />
          <StatCard
            label="ER Beds Available"
            value={stats.er_beds_available}
            sub={`Across ${stats.hospitals_count || 0} registered hospitals`}
            icon="🏥"
            color="#7c3aed"
            onClick={() => onNavigateTab?.('hospitals')}
          />
          <StatCard
            label="Requests Today"
            value={stats.requests_today}
            sub="Logged in emergency registry"
            icon="🚨"
            color="#e02424"
            onClick={() => onNavigateTab?.('emergency')}
          />
        </section>
      )}

      {/* Real-World Hospital & Driver Auto-Sync Panel */}
      <section className="dispatch-panel sync-section" style={{ marginTop: 20 }}>
        <div className="section-header-row">
          <div>
            <span className="eyebrow">OPENSTREETMAP TELEMETRY</span>
            <h2>Sync Live Real-World Healthcare Network</h2>
            <p>Automatically populate live hospitals and driver units from OpenStreetMap rather than manually entering records.</p>
          </div>
        </div>

        <form onSubmit={handleSyncRealWorld} className="sync-form">
          <div className="sync-input-group">
            <label htmlFor="sync-city">Target City / Region</label>
            <input
              id="sync-city"
              type="text"
              placeholder="e.g. Bangalore, Mumbai, Delhi, London..."
              value={syncCity}
              onChange={(e) => setSyncCity(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={syncLoading || !token}>
            {syncLoading ? 'Fetching OpenStreetMap Live Network...' : '🔄 Sync Real-World Hospitals & Ambulances'}
          </button>
        </form>

        {syncMessage && <p className="sync-success-banner">{syncMessage}</p>}
        {syncError && <p className="dispatch-error">{syncError}</p>}
      </section>

      {/* Recent Emergency Requests Table */}
      <section className="dispatch-panel" style={{ marginTop: 24 }}>
        <div className="section-header-row">
          <div>
            <span className="eyebrow">RECENT INCIDENTS</span>
            <h2>Active & Recent Emergency Requests</h2>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadData}>
            Refresh Queue
          </button>
        </div>

        {recentRequests.length > 0 ? (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Emergency Type</th>
                  <th>Status</th>
                  <th>Assigned Vehicle</th>
                  <th>Trip Status</th>
                  <th>Time Logged</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((req) => (
                  <tr key={req.request_id}>
                    <td>
                      <code>{req.request_id.slice(0, 8).toUpperCase()}</code>
                    </td>
                    <td>
                      <strong>{req.emergency_type}</strong>
                    </td>
                    <td>
                      <StatusBadge status={req.request_status} />
                    </td>
                    <td>
                      {req.vehicle_number ? (
                        <span style={{ fontWeight: 600, color: '#1a56db' }}>🚑 {req.vehicle_number}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      {req.trip_status ? <StatusBadge status={req.trip_status} /> : '—'}
                    </td>
                    <td>
                      <small style={{ color: '#64748b' }}>
                        {new Date(req.request_created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </small>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onSelectRequest?.(req.request_id)}
                      >
                        Inspect / Track →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="🚨"
            title="No emergency requests logged today"
            message="Incoming emergency SOS dispatches will appear here instantly."
          />
        )}
      </section>
    </div>
  );
});
