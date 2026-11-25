import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { managementApi, API_BASE } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState } from '../components/LoadingState';

export const AmbulanceManagement = memo(function AmbulanceManagement({ token, user }) {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Add ambulance form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [type, setType] = useState('ALS');
  const [lat, setLat] = useState('12.9716');
  const [lng, setLng] = useState('77.5946');
  const [addLoading, setAddLoading] = useState(false);

  // Driver GPS broadcast state
  const [selectedDriverVehicle, setSelectedDriverVehicle] = useState('');
  const [driverStreaming, setDriverStreaming] = useState(false);
  const [driverGpsStatus, setDriverGpsStatus] = useState('Standby');
  const driverWatchRef = useRef(null);
  const driverSocketRef = useRef(null);

  const loadAmbulances = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await managementApi.resources(token);
      setAmbulances(data.ambulances || []);
      if (!selectedDriverVehicle && data.ambulances?.length > 0) {
        setSelectedDriverVehicle(data.ambulances[0].id);
      }
    } catch (err) {
      setError(err.message || 'Unable to load ambulance fleet.');
    } finally {
      setLoading(false);
    }
  }, [token, selectedDriverVehicle]);

  useEffect(() => {
    loadAmbulances();
  }, [loadAmbulances]);

  // Clean up driver GPS watcher on unmount
  useEffect(() => {
    return () => {
      if (driverWatchRef.current !== null) {
        navigator.geolocation.clearWatch(driverWatchRef.current);
      }
      if (driverSocketRef.current) {
        driverSocketRef.current.disconnect();
      }
    };
  }, []);

  const handleStatusChange = async (ambulanceId, newStatus) => {
    setActionError('');
    try {
      await managementApi.updateAmbulanceStatus(token, ambulanceId, newStatus);
      await loadAmbulances();
    } catch (err) {
      setActionError(err.message || 'Unable to update ambulance status.');
    }
  };

  const handleAddAmbulance = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    setActionError('');
    try {
      await managementApi.createAmbulance(token, {
        vehicleNumber: vehicleNumber.trim(),
        driverName: driverName.trim(),
        type,
        lat: Number(lat),
        lng: Number(lng)
      });
      setShowAddForm(false);
      setVehicleNumber('');
      setDriverName('');
      await loadAmbulances();
    } catch (err) {
      setActionError(err.message || 'Unable to register ambulance.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteAmbulance = async (ambulanceId) => {
    if (!window.confirm('Are you sure you want to remove this ambulance from the fleet?')) return;
    setActionError('');
    try {
      await managementApi.deleteAmbulance(token, ambulanceId);
      await loadAmbulances();
    } catch (err) {
      setActionError(err.message || 'Unable to delete ambulance.');
    }
  };

  const toggleDriverBroadcast = () => {
    if (driverStreaming) {
      if (driverWatchRef.current !== null) {
        navigator.geolocation.clearWatch(driverWatchRef.current);
        driverWatchRef.current = null;
      }
      if (driverSocketRef.current) {
        driverSocketRef.current.disconnect();
        driverSocketRef.current = null;
      }
      setDriverStreaming(false);
      setDriverGpsStatus('Standby');
      return;
    }

    if (!selectedDriverVehicle) {
      alert('Please select an ambulance vehicle to link your device GPS stream.');
      return;
    }

    if (!('geolocation' in navigator)) {
      alert('Browser does not support geolocation.');
      return;
    }

    setDriverStreaming(true);
    setDriverGpsStatus('Connecting to telemetry server...');

    const socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined
    });
    driverSocketRef.current = socket;

    socket.on('connect', () => {
      setDriverGpsStatus('Transmitting live device GPS telemetry...');
    });

    socket.on('auth_error', (err) => {
      setDriverGpsStatus(`Auth Error: ${err.message}`);
    });

    driverWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setDriverGpsStatus(`Live GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (±${Math.round(accuracy)}m)`);
        socket.emit('ambulance_driver_gps', {
          ambulanceId: selectedDriverVehicle,
          lat: latitude,
          lng: longitude
        });
      },
      (err) => {
        setDriverGpsStatus(`GPS Error: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  };

  return (
    <div className="management-page">
      <section className="dispatch-intro">
        <span className="eyebrow">FLEET TELEMETRY & MANAGEMENT</span>
        <h1>Ambulance Fleet Operations</h1>
        <p>Monitor emergency response units, toggle active readiness, and broadcast live device GPS.</p>
      </section>

      {/* Driver GPS Live Broadcast Box */}
      <section className="dispatch-panel driver-telemetry-box" style={{ marginBottom: 24 }}>
        <div className="section-header-row">
          <div>
            <span className="eyebrow">ACTUAL DEVICE GPS STREAM</span>
            <h2>Driver Live GPS Telemetry Broadcast</h2>
            <p>Connect this device's real GPS sensor to an ambulance vehicle to stream live real-world movement to the control room.</p>
          </div>
          <span className={`status-badge-lg ${driverStreaming ? 'badge-live' : 'badge-standby'}`}>
            {driverStreaming ? '● STREAMING LIVE' : '○ STANDBY'}
          </span>
        </div>

        <div className="driver-broadcast-controls">
          <div className="input-group">
            <label htmlFor="driver-vehicle-select">Select Ambulance Vehicle</label>
            <select
              id="driver-vehicle-select"
              value={selectedDriverVehicle}
              onChange={(e) => setSelectedDriverVehicle(e.target.value)}
              disabled={driverStreaming}
            >
              {ambulances.map((amb) => (
                <option key={amb.id} value={amb.id}>
                  {amb.vehicle_number} — {amb.driver_name} ({amb.type})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className={`btn ${driverStreaming ? 'btn-danger' : 'btn-primary'}`}
            onClick={toggleDriverBroadcast}
          >
            {driverStreaming ? '⏹ Stop GPS Broadcast' : '📡 Start Streaming Device GPS'}
          </button>
        </div>

        <div className="gps-status-bar">
          <span>Status: <strong>{driverGpsStatus}</strong></span>
        </div>
      </section>

      {/* Ambulance List & Add Section */}
      <section className="dispatch-panel">
        <div className="section-header-row">
          <div>
            <span className="eyebrow">ACTIVE FLEET</span>
            <h2>Registered Ambulances ({ambulances.length})</h2>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? '✕ Cancel' : '+ Add New Ambulance'}
          </button>
        </div>

        {actionError && <p className="dispatch-error" style={{ marginBottom: 16 }}>{actionError}</p>}

        {showAddForm && (
          <form onSubmit={handleAddAmbulance} className="inline-add-form" style={{ marginBottom: 20 }}>
            <h3>Register New Ambulance</h3>
            <div className="form-grid-3">
              <div>
                <label>Vehicle Plate Number</label>
                <input
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="e.g. KA-01-EA-1008"
                  required
                />
              </div>
              <div>
                <label>Assigned Driver</label>
                <input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Alex Kumar"
                  required
                />
              </div>
              <div>
                <label>Ambulance Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="ALS">ALS (Advanced Life Support)</option>
                  <option value="BLS">BLS (Basic Life Support)</option>
                </select>
              </div>
              <div>
                <label>Initial Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Initial Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={addLoading} style={{ marginTop: 12 }}>
              {addLoading ? 'Saving...' : 'Save Ambulance to Fleet'}
            </button>
          </form>
        )}

        {loading && <LoadingState message="Loading registered fleet..." />}
        {error && <ErrorState message={error} onRetry={loadAmbulances} />}

        {!loading && !error && (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vehicle Number</th>
                  <th>Driver Name</th>
                  <th>Equipment Type</th>
                  <th>Operational Status</th>
                  <th>Coordinates</th>
                  <th>Change Status</th>
                  {user?.role === 'admin' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {ambulances.map((amb) => (
                  <tr key={amb.id}>
                    <td>
                      <strong>🚑 {amb.vehicle_number}</strong>
                    </td>
                    <td>{amb.driver_name}</td>
                    <td>
                      <span className="badge-type">{amb.type}</span>
                    </td>
                    <td>
                      <StatusBadge status={amb.status} />
                    </td>
                    <td>
                      <small style={{ color: '#64748b' }}>
                        {Number(amb.lat).toFixed(4)}, {Number(amb.lng).toFixed(4)}
                      </small>
                    </td>
                    <td>
                      <select
                        value={amb.status}
                        onChange={(e) => handleStatusChange(amb.id, e.target.value)}
                        className="status-inline-select"
                      >
                        <option value="available">Available</option>
                        <option value="busy">Busy / En Route</option>
                        <option value="offline">Offline</option>
                      </select>
                    </td>
                    {user?.role === 'admin' && (
                      <td>
                        <button
                          type="button"
                          className="btn-delete"
                          onClick={() => handleDeleteAmbulance(amb.id)}
                          title="Remove ambulance"
                        >
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
});
