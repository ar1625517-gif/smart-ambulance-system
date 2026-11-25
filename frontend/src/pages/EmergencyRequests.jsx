import { memo, useState, Suspense, lazy } from 'react';
import { dispatchApi, reverseGeocode } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';

const LocationPickerMap = lazy(() =>
  import('../MapViews.jsx').then((module) => ({ default: module.LocationPickerMap }))
);

export const EmergencyRequests = memo(function EmergencyRequests({
  onViewTripTracking
}) {
  const [lat, setLat] = useState('12.9756');
  const [lng, setLng] = useState('77.6068');
  const [detectedAddress, setDetectedAddress] = useState('');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Form details
  const [emergencyType, setEmergencyType] = useState('Cardiology');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [conscious, setConscious] = useState('unknown');
  const [breathing, setBreathing] = useState('unknown');

  // Vitals
  const [heartRate, setHeartRate] = useState('');
  const [systolicBp, setSystolicBp] = useState('');
  const [oxygenSaturation, setOxygenSaturation] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [temperature, setTemperature] = useState('');

  // Dispatch response & states
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleReverseGeocode = async (latitude, longitude) => {
    const address = await reverseGeocode(latitude, longitude);
    if (address) setDetectedAddress(address);
  };

  const detectLocation = () => {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const curLat = pos.coords.latitude.toFixed(6);
        const curLng = pos.coords.longitude.toFixed(6);
        setLat(curLat);
        setLng(curLng);
        setIsDetectingLocation(false);
        handleReverseGeocode(curLat, curLng);
      },
      (err) => {
        setIsDetectingLocation(false);
        alert(`Location detection failed: ${err.message}. Please check browser permissions.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    const payload = {
      lat: Number(lat),
      lng: Number(lng),
      emergencyType,
      patientName: patientName.trim() || undefined,
      patientAge: patientAge === '' ? undefined : Number(patientAge),
      patientGender: patientGender || undefined,
      contactPhone: contactPhone.trim() || undefined,
      medicalNotes: medicalNotes.trim() || undefined,
      conscious: conscious === 'unknown' ? undefined : conscious === 'yes',
      breathing: breathing === 'unknown' ? undefined : breathing === 'yes',
      vitals: {
        heartRate: heartRate || undefined,
        systolicBp: systolicBp || undefined,
        oxygenSaturation: oxygenSaturation || undefined,
        respiratoryRate: respiratoryRate || undefined,
        temperature: temperature || undefined
      }
    };

    try {
      const data = await dispatchApi.submitSos(payload);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Emergency dispatch failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="emergency-requests-page">
      <section className="dispatch-intro">
        <span className="eyebrow">EMERGENCY ASSISTANCE INTAKE</span>
        <h1>Create Emergency Request & Auto-Dispatch</h1>
        <p>Submit emergency coordinates, patient triage info, and immediately assign the closest available ambulance and hospital.</p>
      </section>

      <div className="dispatch-grid">
        {/* Form Panel */}
        <form className="dispatch-panel" onSubmit={handleSubmit}>
          <h2>🚨 Emergency Details & Triage</h2>

          <div className="location-action-bar">
            <button
              type="button"
              className="gps-detect-btn"
              onClick={detectLocation}
              disabled={isDetectingLocation}
            >
              {isDetectingLocation ? '⏳ Detecting GPS...' : '📍 Use My Live Location'}
            </button>
            <button
              type="button"
              className="map-picker-btn"
              onClick={() => setShowMapPicker(!showMapPicker)}
            >
              {showMapPicker ? '✕ Close Map Picker' : '🗺️ Pick on Actual Map'}
            </button>
          </div>

          {detectedAddress && (
            <div className="verified-address-badge">
              <strong>📍 Detected Location:</strong>
              <p>{detectedAddress}</p>
            </div>
          )}

          {showMapPicker && (
            <Suspense fallback={<div className="map-loading">Loading live interactive map...</div>}>
              <LocationPickerMap
                initialLat={lat}
                initialLng={lng}
                onLocationChange={(newLat, newLng) => {
                  setLat(newLat);
                  setLng(newLng);
                  handleReverseGeocode(newLat, newLng);
                }}
              />
            </Suspense>
          )}

          <div className="lat-lng-row">
            <div>
              <label htmlFor="input-lat">Latitude</label>
              <input
                id="input-lat"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  handleReverseGeocode(e.target.value, lng);
                }}
                required
              />
            </div>
            <div>
              <label htmlFor="input-lng">Longitude</label>
              <input
                id="input-lng"
                type="number"
                step="any"
                value={lng}
                onChange={(e) => {
                  setLng(e.target.value);
                  handleReverseGeocode(lat, e.target.value);
                }}
                required
              />
            </div>
          </div>

          <label htmlFor="select-emergency-type">Emergency Specialty</label>
          <select
            id="select-emergency-type"
            value={emergencyType}
            onChange={(e) => setEmergencyType(e.target.value)}
          >
            <option value="Cardiology">Cardiology (Cardiac Arrest / Chest Pain)</option>
            <option value="Trauma">Trauma (Severe Accident / Hemorrhage)</option>
            <option value="Neurology">Neurology (Stroke / Seizure)</option>
            <option value="General">General Medical Emergency</option>
          </select>

          {/* Patient Details & Vitals Section */}
          <div className="dispatch-form-section">
            <h3>Patient Information & Vitals (Optional)</h3>
            <div className="patient-form-grid">
              <label>
                Patient Name
                <input
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. John Doe"
                />
              </label>
              <label>
                Age
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  placeholder="Years"
                />
              </label>
              <label>
                Gender
                <select value={patientGender} onChange={(e) => setPatientGender(e.target.value)}>
                  <option value="">Not specified</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label>
                Caller Contact Phone
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                />
              </label>
              <label className="patient-notes">
                Medical Notes / Symptoms
                <textarea
                  value={medicalNotes}
                  onChange={(e) => setMedicalNotes(e.target.value)}
                  placeholder="Symptoms observed, allergies, medication notes, or incident landmarks"
                  rows={2}
                />
              </label>
              <label>
                Conscious?
                <select value={conscious} onChange={(e) => setConscious(e.target.value)}>
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label>
                Breathing Normally?
                <select value={breathing} onChange={(e) => setBreathing(e.target.value)}>
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label>
                Heart Rate (BPM)
                <input
                  type="number"
                  min="0"
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  placeholder="e.g. 78"
                />
              </label>
              <label>
                Systolic BP (mmHg)
                <input
                  type="number"
                  min="0"
                  value={systolicBp}
                  onChange={(e) => setSystolicBp(e.target.value)}
                  placeholder="e.g. 120"
                />
              </label>
              <label>
                Oxygen SpO2 (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={oxygenSaturation}
                  onChange={(e) => setOxygenSaturation(e.target.value)}
                  placeholder="e.g. 98"
                />
              </label>
              <label>
                Respiration (/min)
                <input
                  type="number"
                  min="0"
                  value={respiratoryRate}
                  onChange={(e) => setRespiratoryRate(e.target.value)}
                  placeholder="e.g. 16"
                />
              </label>
              <label>
                Temperature (°C)
                <input
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="e.g. 37.0"
                />
              </label>
            </div>
          </div>

          <button type="submit" className="dispatch-submit" disabled={loading}>
            {loading ? 'Finding Closest Unit & Reserving Bed...' : '🚑 Dispatch Ambulance Immediately'}
          </button>

          {error && <p className="dispatch-error" role="alert">{error}</p>}
        </form>

        {/* Dispatch Results Panel */}
        <div className="dispatch-panel">
          <h2>📋 Dispatch Outcome & Assignment</h2>
          {!result && (
            <div className="dispatch-empty">
              <span>🏥</span>
              <p>No active dispatch result</p>
              <small>Submit an emergency request above to see the PostGIS-matched ambulance and hospital.</small>
            </div>
          )}

          {result && (
            <div className="dispatch-result-box">
              <div className="dispatch-result-banner">
                <span style={{ fontSize: 28 }}>✅</span>
                <div>
                  <strong>Emergency Dispatched Successfully</strong>
                  <p>Trip ID: <code>{result.tripId}</code></p>
                </div>
              </div>

              <div className="result-detail-card">
                <h3>🚑 Assigned Ambulance</h3>
                <div className="result-info-grid">
                  <div>
                    <span>Vehicle Number:</span>
                    <strong>{result.ambulance.vehicle_number}</strong>
                  </div>
                  <div>
                    <span>Driver:</span>
                    <strong>{result.ambulance.driver_name}</strong>
                  </div>
                  <div>
                    <span>Type:</span>
                    <strong>{result.ambulance.type} (Paramedic-equipped)</strong>
                  </div>
                  <div>
                    <span>Status:</span>
                    <StatusBadge status="busy" label="Dispatched" />
                  </div>
                </div>
              </div>

              <div className="result-detail-card">
                <h3>🏥 Receiving Hospital</h3>
                <div className="result-info-grid">
                  <div>
                    <span>Hospital:</span>
                    <strong>{result.hospital.name}</strong>
                  </div>
                  <div>
                    <span>ER Beds Remaining:</span>
                    <strong>{result.hospital.er_beds_available} Available</strong>
                  </div>
                  <div>
                    <span>Specialties:</span>
                    <span>{result.hospital.specialties?.join(', ') || 'Emergency Medicine'}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 16, padding: '12px' }}
                onClick={() => onViewTripTracking?.(result.tripId, result.requestId)}
              >
                🗺️ Open Live Route Tracking & GPS Telemetry →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
