import { memo, useState, useEffect, useRef, Suspense, lazy, useCallback } from 'react';
import { io } from 'socket.io-client';
import { dispatchApi, API_BASE } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/LoadingState';

const TripMap = lazy(() =>
  import('../MapViews.jsx').then((module) => ({ default: module.TripMap }))
);
const OverviewMap = lazy(() =>
  import('../MapViews.jsx').then((module) => ({ default: module.OverviewMap }))
);

export const LiveTracking = memo(function LiveTracking({
  token,
  initialTripId,
  initialRequestId
}) {
  const [activeTab, setActiveTab] = useState('trip'); // 'trip' | 'overview'
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(initialTripId || null);
  const [selectedTripDetails, setSelectedTripDetails] = useState(null);
  const [liveLocation, setLiveLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState('');

  // Overview map state
  const [overviewData, setOverviewData] = useState({ ambulances: [], hospitals: [], incidents: [] });

  const socketRef = useRef(null);

  const loadTrips = useCallback(async () => {
    try {
      const data = await dispatchApi.listTrips(token);
      const tripList = data.trips || [];
      setTrips(tripList);

      if (initialTripId) {
        setSelectedTripId(initialTripId);
      } else if (initialRequestId) {
        const matchingTrip = tripList.find((t) => t.request_id === initialRequestId);
        if (matchingTrip) {
          setSelectedTripId(matchingTrip.trip_id);
        } else if (tripList.length > 0) {
          setSelectedTripId(tripList[0].trip_id);
        }
      } else if (!selectedTripId && tripList.length > 0) {
        setSelectedTripId(tripList[0].trip_id);
      }
    } catch {
      // Fallback
    }
  }, [token, initialTripId, initialRequestId, selectedTripId]);

  const loadTripDetails = useCallback(async (tripId) => {
    if (!tripId) return;
    setLoading(true);
    setError('');
    try {
      const data = await dispatchApi.getTrip(tripId);
      setSelectedTripDetails(data);
      if (data.ambulance_lat != null && data.ambulance_lng != null) {
        setLiveLocation({ lat: Number(data.ambulance_lat), lng: Number(data.ambulance_lng) });
      }
    } catch (err) {
      setError(err.message || 'Unable to load trip telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const data = await dispatchApi.mapOverview();
      setOverviewData(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTrips();
    loadOverview();
  }, [loadTrips, loadOverview]);

  useEffect(() => {
    if (selectedTripId) {
      loadTripDetails(selectedTripId);
    }
  }, [selectedTripId, loadTripDetails]);

  // Handle location update from simulator or real GPS
  const handleLocationUpdate = useCallback(async ({ tripId, lat, lng, etaMinutes }) => {
    setLiveLocation((prev) => ({
      ...prev,
      lat,
      lng,
      etaMinutes,
      recordedAt: new Date().toISOString()
    }));
    try {
      await dispatchApi.updateTripLocation(tripId, {
        lat,
        lng,
        etaMinutes
      });
    } catch {
      // silent
    }
  }, []);

  // Quick action: create a demo dispatched trip if none exists
  const handleCreateDemoTrip = async () => {
    setStatusLoading(true);
    try {
      const sosResult = await dispatchApi.submitSos({
        lat: 12.9816,
        lng: 77.5946,
        emergencyType: 'Cardiology',
        patientName: 'Demo Patient (Simulation)',
        contactPhone: '+91 98765 43210',
        medicalNotes: 'Generated demo incident for live tracking.',
        vitals: { heartRate: 110, oxygenSaturation: 97, systolicBp: 130 }
      });

      await loadTrips();
      if (sosResult?.tripId) {
        setSelectedTripId(sosResult.tripId);
      }
    } catch (err) {
      alert(`Could not create demo dispatch: ${err.message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  // Socket connection to trip room
  useEffect(() => {
    if (!selectedTripId) return undefined;

    const socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_trip', selectedTripId);
    });

    socket.on('live_location', (payload) => {
      setLiveLocation({
        lat: payload.lat,
        lng: payload.lng,
        recordedAt: payload.recordedAt,
        etaMinutes: payload.etaMinutes
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [selectedTripId, token]);

  const handleStatusTransition = async (nextStatus) => {
    if (!selectedTripId) return;
    setStatusLoading(true);
    try {
      await dispatchApi.updateTripStatus(selectedTripId, nextStatus);
      await loadTripDetails(selectedTripId);
      await loadTrips();
    } catch (err) {
      alert(`Status transition failed: ${err.message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAutoStatus = async () => {
    if (!selectedTripId) return;
    setStatusLoading(true);
    try {
      await dispatchApi.autoAdvanceTrip(selectedTripId);
      await loadTripDetails(selectedTripId);
      await loadTrips();
    } catch (err) {
      alert(`Auto-advance failed: ${err.message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleResetGps = async () => {
    if (!selectedTripId) return;
    try {
      await dispatchApi.resetGpsHistory(selectedTripId);
      await loadTripDetails(selectedTripId);
    } catch (err) {
      alert(`GPS reset failed: ${err.message}`);
    }
  };

  return (
    <div className="tracking-page">
      <section className="dispatch-intro">
        <span className="eyebrow">TELEMETRY & MAPPING</span>
        <h1>Live Ambulance Tracking & Route Intelligence</h1>
        <p>Real-time vehicle positioning over OpenStreetMap with OSRM road routing and ETA projection.</p>
      </section>

      {/* Mode / View Selector */}
      <div className="tracking-mode-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'trip' ? 'active' : ''}`}
          onClick={() => setActiveTab('trip')}
        >
          🚑 Trip Route & Telemetry
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          🌐 Global Fleet Overview
        </button>
      </div>

      {activeTab === 'trip' ? (
        <div className="tracking-grid">
          {/* Controls & Trip Info Sidebar */}
          <div className="tracking-sidebar dispatch-panel">
            <h3>Select Active Incident Trip</h3>
            <select
              value={selectedTripId || ''}
              onChange={(e) => setSelectedTripId(e.target.value)}
              className="trip-selector"
            >
              {trips.length === 0 && <option value="">No active trips found</option>}
              {trips.map((t) => (
                <option key={t.trip_id} value={t.trip_id}>
                  {t.emergency_type} · {t.vehicle_number} ({t.status.replace('_', ' ')})
                </option>
              ))}
            </select>

            {trips.length === 0 && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={statusLoading}
                  onClick={handleCreateDemoTrip}
                >
                  🚨 Create Test Dispatch for Live Tracking
                </button>
              </div>
            )}

            {loading && <LoadingState message="Loading telemetry..." />}
            {error && <ErrorState message={error} onRetry={() => loadTripDetails(selectedTripId)} />}

            {selectedTripDetails && (
              <div className="trip-telemetry-details">
                <div className="telemetry-banner">
                  <div>
                    <span className="eyebrow">STATUS</span>
                    <StatusBadge status={selectedTripDetails.status} />
                  </div>
                  {liveLocation?.etaMinutes != null && (
                    <div className="eta-badge">
                      <span>ESTIMATED TIME</span>
                      <strong>~{Math.round(liveLocation.etaMinutes)} min</strong>
                    </div>
                  )}
                </div>

                <div className="telemetry-info-card">
                  <h4>🚑 Ambulance Unit</h4>
                  <p><strong>{selectedTripDetails.vehicle_number}</strong> ({selectedTripDetails.ambulance_type})</p>
                  <small>Driver: {selectedTripDetails.driver_name}</small>
                  {liveLocation && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                      📍 GPS: {liveLocation.lat?.toFixed(5)}, {liveLocation.lng?.toFixed(5)}
                    </div>
                  )}
                </div>

                <div className="telemetry-info-card">
                  <h4>🏥 Destination Hospital</h4>
                  <p><strong>{selectedTripDetails.hospital_name}</strong></p>
                  <small>ER Beds: {selectedTripDetails.er_beds_available} available</small>
                </div>

                {/* Status Transition Control Buttons */}
                <div className="status-progression-box">
                  <h4>Lifecycle Progression</h4>
                  <div className="progression-btn-group">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={statusLoading || selectedTripDetails.status !== 'dispatched'}
                      onClick={() => handleStatusTransition('en_route')}
                    >
                      En Route
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={statusLoading || selectedTripDetails.status !== 'en_route'}
                      onClick={() => handleStatusTransition('arrived')}
                    >
                      Arrived at Scene
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={statusLoading || selectedTripDetails.status !== 'arrived'}
                      onClick={() => handleStatusTransition('completed')}
                    >
                      Completed / Handover
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={statusLoading || ['completed', 'cancelled'].includes(selectedTripDetails.status)}
                      onClick={handleAutoStatus}
                      style={{ flex: 1 }}
                    >
                      ⚡ Auto Step
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={selectedTripDetails.status !== 'en_route'}
                      onClick={handleResetGps}
                      title="Reset GPS Breadcrumbs"
                    >
                      ↺ Reset Path
                    </button>
                  </div>
                </div>

                <div className="mode-disclaimer">
                  <small>
                    ✓ <strong>OSRM Road Routing Enabled:</strong> Real-time road routes are calculated from OpenStreetMap data. Straight-line estimates are only displayed as fallback if OSRM is unreachable.
                  </small>
                </div>
              </div>
            )}
          </div>

          {/* Map Container */}
          <div className="tracking-map-container dispatch-panel">
            <Suspense fallback={<div className="map-loading">Initializing live GPS map engine...</div>}>
              {selectedTripDetails ? (
                <TripMap
                  trip={selectedTripDetails}
                  liveLocation={liveLocation}
                  onLocationUpdate={handleLocationUpdate}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <EmptyState
                    icon="🗺️"
                    title="No trip selected"
                    message="Select an active trip on the left or create a test dispatch to preview live road tracking."
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: 16 }}
                    disabled={statusLoading}
                    onClick={handleCreateDemoTrip}
                  >
                    🚨 Dispatch Test Incident
                  </button>
                </div>
              )}
            </Suspense>
          </div>
        </div>
      ) : (
        /* Overview Map Mode */
        <div className="tracking-overview-panel dispatch-panel">
          <div className="overview-map-legend" style={{ marginBottom: 14 }}>
            <span><i className="legend-incident"></i> Active Emergency</span>
            <span><i className="legend-ambulance"></i> Available Ambulance</span>
            <span><i className="legend-hospital"></i> Network Hospital</span>
          </div>
          <Suspense fallback={<div className="map-loading">Loading fleet overview map...</div>}>
            <OverviewMap data={overviewData} />
          </Suspense>
        </div>
      )}
    </div>
  );
});
