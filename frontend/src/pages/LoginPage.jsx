import { memo, useState } from 'react';
import { authApi } from '../services/api';

export const LoginPage = memo(function LoginPage({ onBack, onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@1234');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const presets = [
    { label: 'Admin', user: 'admin', pass: 'Admin@1234', desc: 'Full system management & analytics' },
    { label: 'Control Room', user: 'operator1', pass: 'Control@1234', desc: 'Dispatch & live tracking' },
    { label: 'Ambulance Driver', user: 'driver1', pass: 'Driver@1234', desc: 'Assigned trip & GPS broadcast' },
    { label: 'Hospital Staff', user: 'hospital1', pass: 'Hospital@1234', desc: 'Incoming patients & ER capacity' }
  ];

  const applyPreset = (preset) => {
    setUsername(preset.user);
    setPassword(preset.pass);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await authApi.login(username, password);
      onLoginSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <button className="back-button" type="button" onClick={onBack}>
          ← Back to MediRoute
        </button>

        <div className="login-brand">
          <span>✚</span> MediRoute
        </div>

        <span className="eyebrow">HEALTHCARE & EMERGENCY OPERATIONS</span>
        <h1>Secure Staff Sign In</h1>
        <p>Sign in to manage emergency dispatch, ambulance fleet, and hospital intake.</p>

        {/* Demo Quick Select */}
        <div className="login-presets">
          <small style={{ color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            QUICK ROLE DEMO CREDENTIALS:
          </small>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 16 }}>
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`preset-btn ${username === p.user ? 'preset-active' : ''}`}
                onClick={() => applyPreset(p)}
              >
                <strong>{p.label}</strong>
                <small>{p.desc}</small>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <p className="dispatch-error" role="alert">{error}</p>}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? 'Authenticating...' : `Sign in as ${username}`}
          </button>
        </form>

        <div className="login-disclaimer">
          <small>
            MediRoute is a smart ambulance coordination platform. Access is restricted to authorized healthcare and emergency personnel.
          </small>
        </div>
      </section>
    </main>
  );
});
