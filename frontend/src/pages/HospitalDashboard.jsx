import { memo, useState, useEffect, useCallback } from 'react';
import { managementApi, dispatchApi } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/LoadingState';

export const HospitalDashboard = memo(function HospitalDashboard({ token }) {
  const [data, setData] = useState(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editErBeds, setEditErBeds] = useState(0);
  const [editIcuBeds, setEditIcuBeds] = useState(0);

  const loadData = useCallback(async (hospId) => {
    setLoading(true);
    setError('');
    try {
      const res = await managementApi.hospitalIncoming(token, hospId);
      setData(res);
      if (res.hospital) {
        setSelectedHospitalId(res.hospital.id);
        setEditErBeds(res.hospital.er_beds_available);
        setEditIcuBeds(res.hospital.icu_beds_available);
      }
    } catch (err) {
      setError(err.message || 'Unable to load hospital intake data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      if (!document.hidden) loadData(selectedHospitalId || undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, [loadData, selectedHospitalId]);

  const handleSwitchHospital = async (e) => {
    const newId = e.target.value;
    setSelectedHospitalId(newId);
    await loadData(newId);
  };

  const handleUpdateBeds = async (e) => {
    e.preventDefault();
    const targetHospId = selectedHospitalId || data?.hospital?.id;
    if (!targetHospId) return;
    setUpdateLoading(true);
    try {
      await managementApi.updateHospitalBeds(token, targetHospId, editErBeds, editIcuBeds);
      await loadData(targetHospId);
      alert('Hospital bed capacity updated successfully!');
    } catch (err) {
      alert(`Capacity update failed: ${err.message}`);
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleConfirmArrival = async (tripId) => {
    try {
      await dispatchApi.updateTripStatus(tripId, 'completed');
      await loadData(selectedHospitalId || undefined);
    } catch (err) {
      alert(`Handover confirmation failed: ${err.message}`);
    }
  };

  const handleSimulateInbound = async () => {
    setActionLoading(true);
    try {
      const currentHosp = data?.hospital || (data?.hospitals && data.hospitals.find((h) => h.id === selectedHospitalId));
      const lat = Number(currentHosp?.lat || currentHosp?.latitude || 12.9352);
      const lng = Number(currentHosp?.lng || currentHosp?.longitude || 77.6245);

      await dispatchApi.submitSos({
        lat: lat + 0.012,
        lng: lng - 0.015,
        emergencyType: 'Cardiology',
        patientName: 'Kavita Reddy (Inbound)',
        contactPhone: '+91 98450 11223',
        medicalNotes: 'Severe chest pain radiating to left arm. Oxygen administered.',
        vitals: { heartRate: 114, oxygenSaturation: 91, systolicBp: 142 }
      });

      await loadData(selectedHospitalId || undefined);
    } catch (err) {
      alert(`Could not trigger simulated inbound patient: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="hospital-dashboard-page">
      <section className="dispatch-intro">
        <span className="eyebrow">EMERGENCY DEPARTMENT INTAKE CONSOLE</span>
        <h1>Hospital Intake & Bed Management</h1>
        <p>Monitor incoming ambulances, prepare trauma teams, and maintain live bed availability.</p>
      </section>

      {loading && <LoadingState message="Loading hospital intake records..." />}
      {error && <ErrorState message={error} onRetry={loadData} />}

      {!loading && data && (
        <>
          {/* Hospital Bed Availability Management */}
          {data.hospital ? (
            <div className="dispatch-panel" style={{ marginBottom: 24 }}>
              <div className="section-header-row">
                <div>
                  <span className="eyebrow">FACILITY CAPACITY</span>
                  <h2>{data.hospital.name}</h2>
                </div>
                {data.hospitals && data.hospitals.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label htmlFor="hospital-select" style={{ fontSize: 13, color: '#64748b' }}>Facility:</label>
                    <select
                      id="hospital-select"
                      value={selectedHospitalId}
                      onChange={handleSwitchHospital}
                      className="trip-selector"
                      style={{ padding: '6px 12px', fontSize: 14 }}
                    >
                      {data.hospitals.map((h) => (
                        <option key={h.id} value={h.id}>
                          🏥 {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <small style={{ color: '#64748b' }}>
                  Last updated: {new Date(data.hospital.updated_at).toLocaleTimeString()}
                </small>
              </div>

              <form onSubmit={handleUpdateBeds} className="hospital-bed-form">
                <div className="bed-input-card">
                  <label htmlFor="er-beds-input">Available Emergency (ER) Beds</label>
                  <div className="bed-counter">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditErBeds((b) => Math.max(0, b - 1))}
                    >
                      –
                    </button>
                    <input
                      id="er-beds-input"
                      type="number"
                      min="0"
                      value={editErBeds}
                      onChange={(e) => setEditErBeds(Math.max(0, Number(e.target.value)))}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditErBeds((b) => b + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="bed-input-card">
                  <label htmlFor="icu-beds-input">Available Intensive Care (ICU) Beds</label>
                  <div className="bed-counter">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditIcuBeds((b) => Math.max(0, b - 1))}
                    >
                      –
                    </button>
                    <input
                      id="icu-beds-input"
                      type="number"
                      min="0"
                      value={editIcuBeds}
                      onChange={(e) => setEditIcuBeds(Math.max(0, Number(e.target.value)))}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditIcuBeds((b) => b + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={updateLoading} style={{ alignSelf: 'flex-end', height: 42 }}>
                  {updateLoading ? 'Updating...' : 'Save Live Bed Counts'}
                </button>
              </form>
            </div>
          ) : (
            <div className="dispatch-panel" style={{ marginBottom: 24 }}>
              <p style={{ color: '#92400e' }}>
                ⚠️ No hospital is linked to your user account. Please contact an administrator to link a hospital.
              </p>
            </div>
          )}

          {/* Incoming Ambulances Queue */}
          <div className="dispatch-panel">
            <div className="section-header-row">
              <div>
                <span className="eyebrow">INCOMING PATIENTS</span>
                <h2>Active Inbound Ambulances ({data.incoming?.length || 0})</h2>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={actionLoading}
                  onClick={handleSimulateInbound}
                >
                  {actionLoading ? 'Simulating...' : '🚨 Simulate Inbound Patient'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadData(selectedHospitalId || undefined)}>
                  Refresh Queue
                </button>
              </div>
            </div>

            {data.incoming && data.incoming.length > 0 ? (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ambulance</th>
                      <th>Specialty / Category</th>
                      <th>Patient Name & Age</th>
                      <th>Patient Condition</th>
                      <th>Vitals</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.incoming.map((trip) => (
                      <tr key={trip.trip_id}>
                        <td>
                          <strong>🚑 {trip.vehicle_number}</strong>
                          <small style={{ display: 'block', color: '#64748b' }}>
                            Driver: {trip.driver_name}
                          </small>
                        </td>
                        <td>
                          <span className="badge-type">{trip.emergency_type}</span>
                        </td>
                        <td>
                          <strong>{trip.patient_name || 'Anonymous'}</strong>
                          {trip.patient_age && ` (${trip.patient_age} yrs)`}
                          {trip.patient_gender && ` · ${trip.patient_gender}`}
                        </td>
                        <td>
                          {trip.conscious != null && (
                            <span style={{ fontSize: 12, display: 'block' }}>
                              Conscious: <strong>{trip.conscious ? 'Yes' : 'No'}</strong>
                            </span>
                          )}
                          {trip.breathing != null && (
                            <span style={{ fontSize: 12, display: 'block' }}>
                              Breathing: <strong>{trip.breathing ? 'Yes' : 'No'}</strong>
                            </span>
                          )}
                          {trip.medical_notes && (
                            <small style={{ color: '#64748b', display: 'block' }}>
                              Notes: {trip.medical_notes}
                            </small>
                          )}
                        </td>
                        <td>
                          {trip.vitals && Object.keys(trip.vitals).length > 0 ? (
                            <div style={{ fontSize: 12 }}>
                              {trip.vitals.heartRate && <div>HR: {trip.vitals.heartRate} bpm</div>}
                              {trip.vitals.oxygenSaturation && <div>SpO2: {trip.vitals.oxygenSaturation}%</div>}
                              {trip.vitals.systolicBp && <div>BP: {trip.vitals.systolicBp} mmHg</div>}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={trip.status} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleConfirmArrival(trip.trip_id)}
                          >
                            Confirm Arrival & Admission
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="🏥"
                title="No ambulances currently inbound"
                message="Incoming ambulances assigned to your facility will appear here with live vitals."
              />
            )}
          </div>
        </>
      )}
    </div>
  );
});
