import { memo, useState, useEffect, useCallback } from 'react';
import { adminApi, triggerDownload } from '../services/api';
import { StatCard } from '../components/StatCard';
import { LoadingState, ErrorState, EmptyState } from '../components/LoadingState';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const Analytics = memo(function Analytics({ token }) {
  const [analytics, setAnalytics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmRetentionOpen, setConfirmRetentionOpen] = useState(false);
  const retentionDays = 7;
  const [actionSuccess, setActionSuccess] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [analyticsData, auditData] = await Promise.all([
        adminApi.analytics(token),
        adminApi.auditLogs(token, 100)
      ]);
      setAnalytics(analyticsData);
      setAuditLogs(auditData.logs || []);
    } catch (err) {
      setError(err.message || 'Unable to load analytics data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleDownloadCsv = async (reportName) => {
    try {
      const blob = await adminApi.downloadReport(token, reportName);
      triggerDownload(blob, `mediroute-${reportName}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const blob = await adminApi.downloadBackup(token);
      triggerDownload(blob, `mediroute-system-backup-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      alert(`Backup failed: ${err.message}`);
    }
  };

  const handleExecuteRetention = async () => {
    setConfirmRetentionOpen(false);
    setActionSuccess('');
    try {
      const res = await adminApi.retentionCleanup(token, retentionDays);
      const totalDeleted = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      setActionSuccess(`✓ Retention cleanup complete: ${totalDeleted} historical records archived.`);
      await loadAnalytics();
    } catch (err) {
      alert(`Cleanup failed: ${err.message}`);
    }
  };

  const printReport = () => {
    if (!analytics) return;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>MediRoute Executive Analytics Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 40px; }
            h1 { color: #1a56db; margin-bottom: 4px; }
            .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
            .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
            .card strong { display: block; font-size: 24px; color: #1a56db; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
            th { background: #f8fafc; color: #475569; }
          </style>
        </head>
        <body>
          <h1>MediRoute Emergency Response Analytics</h1>
          <p class="meta">Generated: ${new Date().toLocaleString()}</p>
          <div class="grid">
            <div class="card"><span>Total Incidents</span><strong>${analytics.summary.total_requests}</strong></div>
            <div class="card"><span>Active Trips</span><strong>${analytics.summary.active_trips}</strong></div>
            <div class="card"><span>Completed Trips</span><strong>${analytics.summary.completed_trips || 0}</strong></div>
            <div class="card"><span>ER Beds</span><strong>${analytics.summary.er_beds_available}</strong></div>
          </div>
          <h3>Emergency Specialty Breakdown</h3>
          <table>
            <thead><tr><th>Specialty</th><th>Incident Volume</th></tr></thead>
            <tbody>
              ${analytics.emergencies.map((e) => `<tr><td>${e.emergency_type}</td><td>${e.count}</td></tr>`).join('')}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="analytics-page">
      <section className="dispatch-intro">
        <span className="eyebrow">ADMINISTRATIVE INTELLIGENCE</span>
        <h1>System Analytics & Audit Trails</h1>
        <p>PostgreSQL-backed operational metrics, exportable audit reports, and database maintenance.</p>
      </section>

      {/* Export Toolbar */}
      <div className="analytics-toolbar dispatch-panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDownloadCsv('incidents')}>
            📥 Incidents CSV
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDownloadCsv('resources')}>
            📥 Resources CSV
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDownloadCsv('audit')}>
            📥 Audit Log CSV
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownloadBackup}>
            💾 Backup JSON
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={printReport}>
            🖨️ Print / Save PDF
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setConfirmRetentionOpen(true)}
          >
            🧹 7-Day Retention Cleanup
          </button>
        </div>
      </div>

      {actionSuccess && <p className="sync-success-banner">{actionSuccess}</p>}
      {loading && !analytics && <LoadingState message="Aggregating database statistics..." />}
      {error && <ErrorState message={error} onRetry={loadAnalytics} />}

      {analytics && (
        <>
          {/* Summary KPIs */}
          <section className="dispatch-stat-grid" style={{ marginBottom: 20 }}>
            <StatCard label="Total Requests" value={analytics.summary.total_requests} sub="All time database records" icon="🚨" />
            <StatCard label="Total Trips" value={analytics.summary.total_trips} sub={`${analytics.summary.completed_trips || 0} completed`} icon="🚑" />
            <StatCard label="Active Trips" value={analytics.summary.active_trips} sub="Currently en route or arrived" icon="⚡" color="#e02424" />
            <StatCard label="Network ER Beds" value={analytics.summary.er_beds_available} sub={`+ ${analytics.summary.icu_beds_available || 0} ICU beds`} icon="🏥" color="#057a55" />
          </section>

          {/* Breakdown Charts / Grids */}
          <div className="analytics-charts-grid">
            {/* Emergency Types */}
            <article className="analytics-card dispatch-panel">
              <h3>🚨 Emergency Categories</h3>
              <div className="analytics-bars">
                {analytics.emergencies.map((item) => {
                  const max = Math.max(1, ...analytics.emergencies.map((e) => e.count));
                  const pct = Math.round((item.count / max) * 100);
                  return (
                    <div key={item.emergency_type} className="bar-row">
                      <div className="bar-label">
                        <span>{item.emergency_type}</span>
                        <strong>{item.count}</strong>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.max(5, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            {/* Trip Outcomes */}
            <article className="analytics-card dispatch-panel">
              <h3>🏁 Trip Lifecycle Outcomes</h3>
              <div className="outcome-list">
                {analytics.outcomes.map((item) => (
                  <div key={item.status} className="outcome-item">
                    <span style={{ textTransform: 'capitalize' }}>{item.status.replace('_', ' ')}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </article>

            {/* Ambulance Readiness */}
            <article className="analytics-card dispatch-panel">
              <h3>🚑 Fleet Status Distribution</h3>
              <div className="outcome-list">
                {analytics.ambulances.map((item) => (
                  <div key={item.status} className="outcome-item">
                    <span style={{ textTransform: 'capitalize' }}>{item.status}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </article>

            {/* Daily Trend */}
            <article className="analytics-card dispatch-panel">
              <h3>📅 Recent 7-Day Request Trend</h3>
              <div className="daily-bars">
                {analytics.daily.map((item) => (
                  <div key={item.date} className="daily-col">
                    <strong>{item.count}</strong>
                    <div className="daily-bar-box">
                      <div
                        className="daily-bar-fill"
                        style={{
                          height: `${Math.max(10, (item.count / Math.max(1, ...analytics.daily.map((d) => d.count))) * 100)}%`
                        }}
                      />
                    </div>
                    <span>{new Date(`${item.date}T00:00:00`).toLocaleDateString([], { weekday: 'short' })}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          {/* Audit Logs Table */}
          <section className="dispatch-panel" style={{ marginTop: 24 }}>
            <div className="section-header-row">
              <div>
                <span className="eyebrow">AUDIT & COMPLIANCE</span>
                <h2>Security & Operational Audit Log</h2>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadAnalytics}>
                Refresh Log
              </button>
            </div>

            {auditLogs.length > 0 ? (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Actor</th>
                      <th>IP Address</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <code>{log.action}</code>
                        </td>
                        <td>
                          {log.entity_type} {log.entity_id ? `(${String(log.entity_id).slice(0, 8)})` : ''}
                        </td>
                        <td>
                          <strong>{log.actor_name || 'System'}</strong>
                        </td>
                        <td>
                          <small style={{ color: '#64748b' }}>{log.ip_address || '—'}</small>
                        </td>
                        <td>
                          <small style={{ color: '#64748b' }}>
                            {new Date(log.created_at).toLocaleString()}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="📋" title="No audit entries" message="System events will be logged here." />
            )}
          </section>
        </>
      )}

      {/* Retention confirmation modal */}
      <ConfirmDialog
        open={confirmRetentionOpen}
        title="Execute Database Retention Policy?"
        message={`This will purge completed/cancelled trips and emergency requests older than ${retentionDays} days, along with stale location breadcrumbs. This action is audited and irreversible.`}
        confirmLabel="Purge Stale Records"
        dangerous
        onConfirm={handleExecuteRetention}
        onCancel={() => setConfirmRetentionOpen(false)}
      />
    </div>
  );
});
