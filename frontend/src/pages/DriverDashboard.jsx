import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { managementApi, dispatchApi, API_BASE } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/LoadingState';

export const DriverDashboard = memo(function DriverDashboard({ token, user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);

  // GPS Broadcast state
  const [streaming, setStreaming] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('Standby');
  const watchRef = useRef(null);
  const socketRef = useRef(null);

  const loadAssignment = useCallback(async (ambulanceId) => {
    setLoading(true);
    setError('');
    try {
      const res = await managementApi.driverAssignment(token, ambulanceId || undefined);
      setData(res);
      if (res.ambulance?.id && !selectedAmbulanceId) {
        setSelectedAmbulanceId(res.ambulance.id);
      }
    } catch (err) {
      setError(err.message || 'Unable to load assigned ambulance trip.');
    } finally {
      setLoading(false);
    }
  }, [token, selectedAmbulanceId]);

  useEffect(() => {
    loadAssignment();
    const timer = setInterval(() => {
      if (!document.hidden) loadAssignment(selectedAmbulanceId || undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, [loadAssignment, selectedAmbulanceId]);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const handleSwitchAmbulance = async (e) => {
    const newId = e.target.value;
    setSelectedAmbulanceId(newId);
    await loadAssignment(newId);
  };

  const handleClaimVehicle = async () => {
    if (!selectedAmbulanceId) return;
    setClaimLoading(true);
    try {
      await managementApi.claimVehicle(token, selectedAmbulanceId);
      await loadAssignment(selectedAmbulanceId);
    } catch (err) {
      alert(`Could not claim vehicle: ${err.message}`);
    } finally {
      setClaimLoading(false);
    }
  };

  const toggleGpsBroadcast = () => {
    if (streaming) {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setStreaming(false);
      setGpsStatus('Standby');
      return;
    }

    if (!data?.ambulance?.id) {
      alert('No ambulance is assigned to your profile.');
      return;
    }

    if (!('geolocation' in navigator)) {
      alert('Browser geolocation is unavailable.');
      return;
    }

    setStreaming(true);
    setGpsStatus('Connecting to dispatch telemetry...');

    const socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setGpsStatus('Streaming device GPS to dispatch & hospital...');
    });

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsStatus(`Transmitting: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`);

        // If active trip is en route, transmit trip live location as well
        if (data.assignment?.trip_id && data.assignment.status === 'en_route') {
          socket.emit('driver_location_update', {
            tripId: data.assignment.trip_id,
            lat: latitude,
            lng: longitude
          });
        }

        socket.emit('ambulance_driver_gps', {
          ambulanceId: data.ambulance.id,
          lat: latitude,
          lng: longitude
        });
      },
      (err) => setGpsStatus(`GPS Sensor Error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  };

  const handleUpdateStatus = async (nextStatus) => {
    if (!data?.assignment?.trip_id) return;
    setStatusLoading(true);
    try {
      await dispatchApi.updateTripStatus(data.assignment.trip_id, nextStatus);
      await loadAssignment(selectedAmbulanceId || undefined);
    } catch (err) {
      alert(`Status update failed: ${err.message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="driver-dashboard-page">
      <section className="dispatch-intro">
        <span className="eyebrow">AMBULANCE CREW MOBILE CONSOLE</span>
        <h1>Driver Emergency Navigation & Status</h1>
        <p>Logged in as: <strong>{user?.displayName || user?.username}</strong>. Receive incident dispatches and transmit live vehicle telemetry.</p>
      </section>

      {loading && <LoadingState message="Loading assigned trip..." />}
      {error && <ErrorState message={error} onRetry={loadAssignment} />}

      {!loading && data && (
        <div className="driver-layout-grid">
          {/* Ambulance Info & GPS Transmitter */}
          <div className="dispatch-panel">
            <h2>🚑 My Vehicle Telemetry</h2>

            {/* Vehicle Selector - visible when multiple ambulances are available */}
            {data.ambulances && data.ambulances.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="ambulance-select" style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Select Operating Vehicle:
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    id="ambulance-select"
                    value={selectedAmbulanceId}
                    onChange={handleSwitchAmbulance}
                    className="trip-selector"
                    style={{ flex: 1 }}
                  >
                    {data.ambulances.map((a) => (
                      <option key={a.id} value={a.id}>
                        🚑 {a.vehicle_number} ({a.type}) – {a.status}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={claimLoading || selectedAmbulanceId === data.ambulance?.id}
                    onClick={handleClaimVehicle}
                    title="Link this ambulance to your profile"
                  >
                    {claimLoading ? 'Claiming...' : 'Claim'}
                  </button>
                </div>
              </div>
            )}

            {data.ambulance ? (
              <div className="driver-vehicle-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span className="eyebrow">ASSIGNED VEHICLE</span>
                    <h3 style={{ margin: 0, fontSize: 20 }}>{data.ambulance.vehicle_number}</h3>
                  </div>
                  <span className="badge-type">{data.ambulance.type}</span>
                </div>
                <p>Status: <StatusBadge status={data.ambulance.status} /></p>

                <div className="gps-box" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className={`btn ${streaming ? 'btn-danger' : 'btn-primary'}`}
                    style={{ width: '100%', padding: '12px' }}
                    onClick={toggleGpsBroadcast}
                  >
                    {streaming ? '⏹ Stop Transmitting Live GPS' : '📡 Start Streaming My Device GPS'}
                  </button>
                  <p style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
                    Sensor Status: <strong>{gpsStatus}</strong>
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState icon="🚑" title="No ambulance linked" message="Select a vehicle above and click Claim, or ask an administrator to link one." />
            )}
          </div>

          {/* Active Trip Assignment */}
          <div className="dispatch-panel">
            <h2>🚨 Active Trip Assignment</h2>
            {data.assignment ? (
              <div className="driver-trip-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="eyebrow">TRIP #{data.assignment.trip_id.slice(0, 8).toUpperCase()}</span>
                  <StatusBadge status={data.assignment.status} />
                </div>

                <div className="trip-target-info" style={{ marginTop: 12 }}>
                  <h3>Patient / Scene Info</h3>
                  <p><strong>Emergency:</strong> {data.assignment.emergency_type}</p>
                  {data.assignment.patient_name && <p><strong>Patient:</strong> {data.assignment.patient_name}</p>}
                  {data.assignment.medical_notes && (
                    <div className="patient-notes-callout">
                      <strong>Notes:</strong> {data.assignment.medical_notes}
                    </div>
                  )}
                  <p>
                    <strong>Coordinates:</strong> {Number(data.assignment.request_lat).toFixed(4)}, {Number(data.assignment.request_lng).toFixed(4)}
                  </p>
                </div>

                <div className="trip-target-info" style={{ marginTop: 16 }}>
                  <h3>🏥 Receiving Facility</h3>
                  <p><strong>{data.assignment.hospital_name}</strong></p>
                  {data.assignment.hospital_phone && (
                    <p>📞 Phone: <a href={`tel:${data.assignment.hospital_phone}`}>{data.assignment.hospital_phone}</a></p>
                  )}
                </div>

                {/* Driver Action Lifecycle Buttons */}
                <div className="driver-actions-panel" style={{ marginTop: 20 }}>
                  <h4>Update Trip Status</h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {data.assignment.status === 'dispatched' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={statusLoading}
                        onClick={() => handleUpdateStatus('en_route')}
                      >
                        🚑 Mark En Route to Incident
                      </button>
                    )}
                    {data.assignment.status === 'en_route' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={statusLoading}
                        onClick={() => handleUpdateStatus('arrived')}
                      >
                        📍 Mark Arrived at Scene
                      </button>
                    )}
                    {data.assignment.status === 'arrived' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={statusLoading}
                        onClick={() => handleUpdateStatus('completed')}
                      >
                        🏥 Confirm Patient Handover / Complete Trip
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="☕"
                title="No active incident assigned"
                message="You are on standby. New emergency dispatches will appear here instantly."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});
