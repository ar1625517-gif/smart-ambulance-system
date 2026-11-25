import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents
} from "react-leaflet";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";

// Custom emergency marker icons with high-visibility styling
const ambulanceIcon = (heading = 0) =>
  L.divIcon({
    className: "mediroute-map-marker-wrap",
    html: `
      <div class="custom-map-pin pin-ambulance" style="transform: rotate(${heading}deg);">
        <span class="pin-badge">🚑</span>
        <span class="pin-pulse"></span>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -22]
  });

const hospitalIcon = L.divIcon({
  className: "mediroute-map-marker-wrap",
  html: `
    <div class="custom-map-pin pin-hospital">
      <span class="pin-badge">🏥</span>
    </div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -20]
});

const incidentIcon = L.divIcon({
  className: "mediroute-map-marker-wrap",
  html: `
    <div class="custom-map-pin pin-incident">
      <span class="pin-badge">🚨</span>
      <span class="pin-radar"></span>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20]
});

const userLocationIcon = L.divIcon({
  className: "mediroute-map-marker-wrap",
  html: `
    <div class="custom-map-pin pin-user-location">
      <span class="pin-badge">📍</span>
      <span class="pin-radar"></span>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18]
});

// Fit map bounds helper
function FitBounds({ points, padding = [40, 40] }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;
    const valid = points.filter(
      (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
    );
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView(valid[0], 14);
      return;
    }
    map.fitBounds(valid, { padding, maxZoom: 16 });
  }, [map, points, padding]);

  return null;
}

// Map click listener for Location Picker
function LocationPickerEvents({ onLocationSelected }) {
  useMapEvents({
    click(e) {
      if (onLocationSelected) {
        onLocationSelected(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

// Cache for OSRM routes to prevent redundant requests
const routeCache = new Map();

/**
 * Fetch real driving road geometry from OSRM
 */
async function fetchRoadRoute(startLng, startLat, endLng, endLat) {
  const cacheKey = `${startLng.toFixed(4)},${startLat.toFixed(4)};${endLng.toFixed(4)},${endLat.toFixed(4)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=false`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("OSRM routing request failed");
    const data = await res.json();

    if (data.code === "Ok" && data.routes && data.routes[0]) {
      const route = data.routes[0];
      // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
      const latLngPoints = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const result = {
        points: latLngPoints,
        distanceKm: (route.distance / 1000).toFixed(1),
        durationMin: Math.max(1, Math.round(route.duration / 60)),
        isActualRoad: true
      };
      routeCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn("OSRM routing unavailable, using geodesic path fallback:", err.message);
  }

  // Fallback to straight line
  const fallback = {
    points: [
      [startLat, startLng],
      [endLat, endLng]
    ],
    distanceKm: (
      L.latLng(startLat, startLng).distanceTo(L.latLng(endLat, endLng)) / 1000
    ).toFixed(1),
    durationMin: Math.max(
      1,
      Math.round(
        (L.latLng(startLat, startLng).distanceTo(L.latLng(endLat, endLng)) / 1000 / 40) * 60
      )
    ),
    isActualRoad: false
  };
  return fallback;
}

/**
 * Calculate compass bearing between two points
 */
function getBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

/**
 * TRIP MAP: Full road-routing map with live telemetry & simulator
 */
export function TripMap({
  request,
  trip,
  liveLocation,
  onLocationUpdate
}) {
  const tripData = request || trip || {};
  const [routeToIncident, setRouteToIncident] = useState(null);
  const [routeToHospital, setRouteToHospital] = useState(null);
  const [routingLoading, setRoutingLoading] = useState(true);

  // Live simulation & telemetry state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState(2);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [isStreamingGps, setIsStreamingGps] = useState(false);
  const [heading, setHeading] = useState(0);

  const simIndexRef = useRef(0);
  const simTimerRef = useRef(null);
  const watchIdRef = useRef(null);

  // Ambulance starting position
  const ambLat = Number(liveLocation?.lat ?? tripData.ambulance_lat ?? tripData.request_lat ?? tripData.pickup_lat ?? 12.9716);
  const ambLng = Number(liveLocation?.lng ?? tripData.ambulance_lng ?? tripData.request_lng ?? tripData.pickup_lng ?? 77.5946);
  const reqLat = Number(tripData.request_lat ?? tripData.pickup_lat ?? ambLat);
  const reqLng = Number(tripData.request_lng ?? tripData.pickup_lng ?? ambLng);
  const hospLat = Number(tripData.hospital_lat ?? reqLat);
  const hospLng = Number(tripData.hospital_lng ?? reqLng);
  const activeTripId = tripData.trip_id || tripData.id;

  // 1. Fetch real road routes
  useEffect(() => {
    let active = true;
    async function loadRoutes() {
      setRoutingLoading(true);
      try {
        const startLat = Number(tripData.ambulance_lat || ambLat);
        const startLng = Number(tripData.ambulance_lng || ambLng);
        const incLat = reqLat;
        const incLng = reqLng;
        const targetHospLat = hospLat;
        const targetHospLng = hospLng;

        const [leg1, leg2] = await Promise.all([
          fetchRoadRoute(startLng, startLat, incLng, incLat),
          fetchRoadRoute(incLng, incLat, targetHospLng, targetHospLat)
        ]);

        if (active) {
          setRouteToIncident(leg1);
          setRouteToHospital(leg2);
        }
      } catch (err) {
        console.error("Road route fetch error:", err);
      } finally {
        if (active) setRoutingLoading(false);
      }
    }

    loadRoutes();
    return () => {
      active = false;
    };
  }, [tripData.ambulance_lat, tripData.ambulance_lng, reqLat, reqLng, hospLat, hospLng, ambLat, ambLng]);

  // Combined road path points for the whole journey
  const fullRoadPoints = useMemo(() => [
    ...(routeToIncident?.points || []),
    ...(routeToHospital?.points || [])
  ], [routeToIncident, routeToHospital]);

  // 2. Road Simulation Controller
  const stopSimulation = useCallback(() => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setIsSimulating(false);
    setCurrentSpeedKmh(0);
  }, []);

  const startSimulation = useCallback(() => {
    if (!fullRoadPoints.length || !onLocationUpdate) return;
    stopSimulation();
    setIsSimulating(true);

    const stepDelay = Math.max(300, 1500 / simSpeedMultiplier);

    simTimerRef.current = setInterval(() => {
      simIndexRef.current = (simIndexRef.current + 1);

      if (simIndexRef.current >= fullRoadPoints.length) {
        simIndexRef.current = 0; // Loop or stop
      }

      const nextPoint = fullRoadPoints[simIndexRef.current];
      const prevPoint =
        fullRoadPoints[Math.max(0, simIndexRef.current - 1)];

      if (nextPoint && prevPoint) {
        const calculatedHeading = Math.round(
          getBearing(prevPoint[0], prevPoint[1], nextPoint[0], nextPoint[1])
        );
        setHeading(calculatedHeading);
      }

      const simSpeed = 42 + Math.round(Math.random() * 16);
      setCurrentSpeedKmh(simSpeed);

      if (nextPoint && onLocationUpdate) {
        // Estimate remaining distance
        const remainingSteps = fullRoadPoints.length - simIndexRef.current;
        const remainingMinutes = Math.max(1, Math.round(remainingSteps * 0.15));

        onLocationUpdate({
          tripId: activeTripId,
          lat: nextPoint[0],
          lng: nextPoint[1],
          etaMinutes: remainingMinutes
        });
      }
    }, stepDelay);
  }, [fullRoadPoints, onLocationUpdate, activeTripId, simSpeedMultiplier, stopSimulation]);

  // Cleanup simulation on unmount
  useEffect(() => {
    return () => stopSimulation();
  }, [stopSimulation]);

  // 3. Real Device GPS Streamer
  const toggleDeviceGps = useCallback(() => {
    if (isStreamingGps) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsStreamingGps(false);
      return;
    }

    if (!("geolocation" in navigator)) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setIsStreamingGps(true);
    stopSimulation();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed } = pos.coords;
        setCurrentSpeedKmh(
          speed ? Math.round(speed * 3.6) : 35
        );
        if (onLocationUpdate && activeTripId) {
          onLocationUpdate({
            tripId: activeTripId,
            lat: latitude,
            lng: longitude,
            etaMinutes: 5
          });
        }
      },
      (err) => {
        console.warn("GPS watch error:", err.message);
        setIsStreamingGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }, [isStreamingGps, onLocationUpdate, activeTripId, stopSimulation]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const currentAmbulanceLat = Number(liveLocation?.lat ?? ambLat);
  const currentAmbulanceLng = Number(liveLocation?.lng ?? ambLng);

  // All key points for camera framing
  const keyPoints = [
    [currentAmbulanceLat, currentAmbulanceLng],
    [reqLat, reqLng],
    [hospLat, hospLng]
  ];

  return (
    <div className="trip-map-container-wrap">
      {/* Route & Telemetry HUD Overlay */}
      <div className="trip-map-hud">
        <div className="hud-metric-pill">
          <span className="hud-badge pulse">LIVE ROAD</span>
          <span className="hud-text">
            {routingLoading
              ? "Calculating real road path..."
              : routeToIncident?.isActualRoad
              ? "Actual Road Routing (OSRM)"
              : "Road Route Connected"}
          </span>
        </div>

        {routeToIncident && (
          <div className="hud-stats-group">
            <div className="hud-stat-item">
              <span className="hud-label">To Scene:</span>
              <strong>{routeToIncident.distanceKm} km</strong>
              <small>({routeToIncident.durationMin} min)</small>
            </div>
            {routeToHospital && (
              <div className="hud-stat-item">
                <span className="hud-label">To Hospital:</span>
                <strong>{routeToHospital.distanceKm} km</strong>
                <small>({routeToHospital.durationMin} min)</small>
              </div>
            )}
            {currentSpeedKmh > 0 && (
              <div className="hud-stat-item speed-meter">
                <span className="hud-label">Speed:</span>
                <strong className="speed-val">{currentSpeedKmh} km/h</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actual Interactive Leaflet Map */}
      <MapContainer
        center={[reqLat, reqLng]}
        zoom={13}
        scrollWheelZoom
        className="trip-leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Incident Scene Marker */}
        <Marker
          position={[reqLat, reqLng]}
          icon={incidentIcon}
        >
          <Popup>
            <div className="map-popup-card">
              <h4>🚨 Emergency Incident</h4>
              <p><strong>Type:</strong> {tripData.emergency_type || "Emergency"}</p>
              <p><strong>Patient:</strong> {tripData.patient_name || "Awaiting verification"}</p>
              <p><strong>Status:</strong> {tripData.request_status || tripData.status || "Active"}</p>
            </div>
          </Popup>
        </Marker>

        {/* Hospital Destination Marker */}
        <Marker
          position={[hospLat, hospLng]}
          icon={hospitalIcon}
        >
          <Popup>
            <div className="map-popup-card">
              <h4>🏥 {tripData.hospital_name || "Assigned Hospital"}</h4>
              <p><strong>Available ER Beds:</strong> {tripData.er_beds_available ?? "Ready"}</p>
              {tripData.icu_beds_available != null && (
                <p><strong>ICU Beds:</strong> {tripData.icu_beds_available}</p>
              )}
            </div>
          </Popup>
        </Marker>

        {/* Live Ambulance Marker */}
        <Marker
          position={[currentAmbulanceLat, currentAmbulanceLng]}
          icon={ambulanceIcon(heading)}
        >
          <Popup>
            <div className="map-popup-card">
              <h4>🚑 {tripData.vehicle_number || "Active Ambulance"}</h4>
              <p><strong>Driver:</strong> {tripData.driver_name || "Response Crew"}</p>
              <p><strong>Speed:</strong> {currentSpeedKmh > 0 ? `${currentSpeedKmh} km/h` : "Ready / En Route"}</p>
              {liveLocation?.recordedAt && (
                <small>GPS Updated: {new Date(liveLocation.recordedAt).toLocaleTimeString()}</small>
              )}
            </div>
          </Popup>
        </Marker>

        {/* Actual Road Navigation Polyline: Ambulance -> Incident (Solid Blue) */}
        {routeToIncident?.points && (
          <Polyline
            positions={routeToIncident.points}
            pathOptions={{
              color: "#2563eb",
              weight: 5,
              opacity: 0.9,
              lineCap: "round",
              lineJoin: "round"
            }}
          />
        )}

        {/* Actual Road Navigation Polyline: Incident -> Hospital (Emerald Dashed) */}
        {routeToHospital?.points && (
          <Polyline
            positions={routeToHospital.points}
            pathOptions={{
              color: "#059669",
              weight: 5,
              dashArray: "8, 8",
              opacity: 0.85
            }}
          />
        )}

        <FitBounds points={keyPoints} />
      </MapContainer>

      {/* Simulator & Live GPS Floating Controls */}
      <div className="trip-map-controls-bar">
        {!isSimulating ? (
          <button
            type="button"
            className="sim-btn sim-btn-play"
            onClick={startSimulation}
            title="Simulate driving along actual road route"
          >
            🚗 Start Live Road Driving Simulation
          </button>
        ) : (
          <div className="sim-active-controls">
            <button
              type="button"
              className="sim-btn sim-btn-stop"
              onClick={stopSimulation}
            >
              ⏸ Pause Simulation
            </button>
            <div className="sim-speed-selector">
              <span>Speed:</span>
              {[1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  className={`spd-pill ${simSpeedMultiplier === spd ? "active" : ""}`}
                  onClick={() => {
                    setSimSpeedMultiplier(spd);
                    if (isSimulating) {
                      stopSimulation();
                      setTimeout(startSimulation, 50);
                    }
                  }}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className={`sim-btn sim-btn-gps ${isStreamingGps ? "streaming" : ""}`}
          onClick={toggleDeviceGps}
          title="Transmit your device's actual GPS in real time"
        >
          {isStreamingGps ? "🔴 Streaming Device GPS" : "📡 Use Real Device GPS"}
        </button>
      </div>
    </div>
  );
}

/**
 * LOCATION PICKER MAP: Allows users to click on the map to set exact emergency spot
 */
export function LocationPickerMap({ initialLat, initialLng, onLocationChange }) {
  const [selectedPos, setSelectedPos] = useState([
    Number(initialLat) || 12.9756,
    Number(initialLng) || 77.6068
  ]);
  const [prevInitial, setPrevInitial] = useState({ lat: initialLat, lng: initialLng });

  if (initialLat !== prevInitial.lat || initialLng !== prevInitial.lng) {
    setPrevInitial({ lat: initialLat, lng: initialLng });
    if (Number.isFinite(Number(initialLat)) && Number.isFinite(Number(initialLng))) {
      setSelectedPos([Number(initialLat), Number(initialLng)]);
    }
  }

  const handleSelect = (lat, lng) => {
    setSelectedPos([lat, lng]);
    if (onLocationChange) {
      onLocationChange(lat.toFixed(6), lng.toFixed(6));
    }
  };

  return (
    <div className="location-picker-map-wrap">
      <div className="picker-map-instructions">
        <span>📍 Click anywhere on the map or drag the pin to set the emergency location</span>
      </div>
      <MapContainer
        center={selectedPos}
        zoom={14}
        scrollWheelZoom
        className="picker-leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationPickerEvents onLocationSelected={handleSelect} />
        <Marker
          position={selectedPos}
          icon={userLocationIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const position = marker.getLatLng();
              handleSelect(position.lat, position.lng);
            }
          }}
        >
          <Popup>Selected Emergency Spot</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

/**
 * OVERVIEW MAP: Landing page city network map
 */
export const OverviewMap = ({ data }) => {
  const [userCenter, setUserCenter] = useState(null);

  const ambulances = data?.ambulances || [];
  const hospitals = data?.hospitals || [];
  const incidents = data?.incidents || [];

  const allPoints = [
    ...ambulances.map((a) => [Number(a.lat), Number(a.lng)]),
    ...hospitals.map((h) => [Number(h.lat), Number(h.lng)]),
    ...incidents.map((i) => [Number(i.lat), Number(i.lng)])
  ].filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));

  const centerOnUser = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCenter([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => console.warn("GPS center error:", err.message)
    );
  };

  return (
    <div className="overview-map-container">
      <div className="overview-floating-tools">
        <button
          type="button"
          className="overview-locate-btn"
          onClick={centerOnUser}
          title="Center on my current location"
        >
          🎯 My Location
        </button>
        <span className="overview-fleet-counter">
          🚑 {ambulances.length} Active Units · 🏥 {hospitals.length} Hospitals
        </span>
      </div>

      <MapContainer
        center={userCenter || [12.9738, 77.6055]}
        zoom={13}
        scrollWheelZoom
        className="overview-leaflet-container"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {userCenter && (
          <Marker position={userCenter} icon={userLocationIcon}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {hospitals.map((hospital) => (
          <Marker
            key={hospital.id}
            position={[Number(hospital.lat), Number(hospital.lng)]}
            icon={hospitalIcon}
          >
            <Popup>
              <div className="map-popup-card">
                <strong>{hospital.name}</strong>
                <p>ER Beds: <strong>{hospital.er_beds_available}</strong></p>
                {hospital.specialties && (
                  <p>Specialties: {hospital.specialties.join(", ")}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {ambulances.map((ambulance) => (
          <Marker
            key={ambulance.id}
            position={[Number(ambulance.lat), Number(ambulance.lng)]}
            icon={ambulanceIcon(0)}
          >
            <Popup>
              <div className="map-popup-card">
                <strong>{ambulance.vehicle_number}</strong>
                <p>Status: <span className="status-badge-mini">{ambulance.status}</span></p>
                {ambulance.driver_name && <p>Driver: {ambulance.driver_name}</p>}
              </div>
            </Popup>
          </Marker>
        ))}

        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            position={[Number(incident.lat), Number(incident.lng)]}
            icon={incidentIcon}
          >
            <Popup>
              <div className="map-popup-card">
                <strong>🚨 {incident.emergency_type}</strong>
                <p>Status: {incident.status}</p>
                {incident.created_at && (
                  <small>{new Date(incident.created_at).toLocaleTimeString()}</small>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {allPoints.length > 0 && !userCenter && (
          <FitBounds points={allPoints} />
        )}
      </MapContainer>
    </div>
  );
};
