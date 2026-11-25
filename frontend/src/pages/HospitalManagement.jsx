import { memo, useState, useEffect, useCallback } from 'react';
import { managementApi } from '../services/api';
import { LoadingState, ErrorState } from '../components/LoadingState';

export const HospitalManagement = memo(function HospitalManagement({ token, user }) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Add hospital form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [specialties, setSpecialties] = useState(['General', 'Cardiology']);
  const [erBeds, setErBeds] = useState(10);
  const [icuBeds, setIcuBeds] = useState(4);
  const [lat, setLat] = useState('12.9698');
  const [lng, setLng] = useState('77.5986');
  const [contactPhone, setContactPhone] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Edit bed count modal / inline state
  const [editingHospitalId, setEditingHospitalId] = useState(null);
  const [editErBeds, setEditErBeds] = useState(0);
  const [editIcuBeds, setEditIcuBeds] = useState(0);

  const availableSpecialties = ['Cardiology', 'Trauma', 'Neurology', 'General'];

  const loadHospitals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await managementApi.resources(token);
      setHospitals(data.hospitals || []);
    } catch (err) {
      setError(err.message || 'Unable to load registered hospitals.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadHospitals();
  }, [loadHospitals]);

  const handleToggleSpecialty = (spec) => {
    setSpecialties((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

  const handleAddHospital = async (e) => {
    e.preventDefault();
    if (specialties.length === 0) {
      setActionError('Please select at least one medical specialty.');
      return;
    }
    setAddLoading(true);
    setActionError('');
    try {
      await managementApi.createHospital(token, {
        name: name.trim(),
        specialties,
        erBeds: Number(erBeds),
        icuBeds: Number(icuBeds),
        lat: Number(lat),
        lng: Number(lng),
        contactPhone: contactPhone.trim() || undefined
      });
      setShowAddForm(false);
      setName('');
      setContactPhone('');
      await loadHospitals();
    } catch (err) {
      setActionError(err.message || 'Unable to add hospital.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleStartEdit = (h) => {
    setEditingHospitalId(h.id);
    setEditErBeds(h.er_beds_available);
    setEditIcuBeds(h.icu_beds_available);
  };

  const handleSaveBeds = async (hospitalId) => {
    setActionError('');
    try {
      await managementApi.updateHospitalBeds(token, hospitalId, editErBeds, editIcuBeds);
      setEditingHospitalId(null);
      await loadHospitals();
    } catch (err) {
      setActionError(err.message || 'Unable to update hospital beds.');
    }
  };

  const handleDeleteHospital = async (hospitalId) => {
    if (!window.confirm('Are you sure you want to remove this hospital from the network?')) return;
    setActionError('');
    try {
      await managementApi.deleteHospital(token, hospitalId);
      await loadHospitals();
    } catch (err) {
      setActionError(err.message || 'Unable to delete hospital.');
    }
  };

  return (
    <div className="management-page">
      <section className="dispatch-intro">
        <span className="eyebrow">HOSPITAL NETWORK COORDINATION</span>
        <h1>Hospital & Emergency Bed Capacity</h1>
        <p>Monitor ER trauma intake, manage critical ICU bed availability, and configure healthcare facilities.</p>
      </section>

      <section className="dispatch-panel">
        <div className="section-header-row">
          <div>
            <span className="eyebrow">NETWORK DIRECTORY</span>
            <h2>Connected Hospitals ({hospitals.length})</h2>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? '✕ Cancel' : '+ Register New Hospital'}
          </button>
        </div>

        {actionError && <p className="dispatch-error" style={{ marginBottom: 16 }}>{actionError}</p>}

        {showAddForm && (
          <form onSubmit={handleAddHospital} className="inline-add-form" style={{ marginBottom: 24 }}>
            <h3>Register Healthcare Facility</h3>
            <div className="form-grid-3">
              <div>
                <label>Hospital Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. City General Trauma Center"
                  required
                />
              </div>
              <div>
                <label>ER Beds Available</label>
                <input
                  type="number"
                  min="0"
                  value={erBeds}
                  onChange={(e) => setErBeds(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>ICU Beds Available</label>
                <input
                  type="number"
                  min="0"
                  value={icuBeds}
                  onChange={(e) => setIcuBeds(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Emergency Contact Phone</label>
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="e.g. +91 80 2299 1234"
                />
              </div>
              <div>
                <label>Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Medical Specialties</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {availableSpecialties.map((spec) => (
                  <label key={spec} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={specialties.includes(spec)}
                      onChange={() => handleToggleSpecialty(spec)}
                    />
                    <span>{spec}</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={addLoading} style={{ marginTop: 16 }}>
              {addLoading ? 'Saving...' : 'Save Hospital to Network'}
            </button>
          </form>
        )}

        {loading && <LoadingState message="Loading hospital network..." />}
        {error && <ErrorState message={error} onRetry={loadHospitals} />}

        {!loading && !error && (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hospital Name</th>
                  <th>Specialties</th>
                  <th>ER Beds</th>
                  <th>ICU Beds</th>
                  <th>Location</th>
                  <th>Bed Capacity Action</th>
                  {user?.role === 'admin' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {hospitals.map((h) => {
                  const isEditing = editingHospitalId === h.id;
                  return (
                    <tr key={h.id}>
                      <td>
                        <strong>🏥 {h.name}</strong>
                        {h.contact_phone && (
                          <small style={{ display: 'block', color: '#64748b' }}>
                            📞 {h.contact_phone}
                          </small>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {h.specialties?.map((s) => (
                            <span key={s} className="badge-spec">{s}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editErBeds}
                            onChange={(e) => setEditErBeds(e.target.value)}
                            style={{ width: 60, padding: 4 }}
                          />
                        ) : (
                          <span className={`bed-count ${h.er_beds_available > 0 ? 'bed-avail' : 'bed-zero'}`}>
                            {h.er_beds_available} Available
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editIcuBeds}
                            onChange={(e) => setEditIcuBeds(e.target.value)}
                            style={{ width: 60, padding: 4 }}
                          />
                        ) : (
                          <span className="bed-count">{h.icu_beds_available} Beds</span>
                        )}
                      </td>
                      <td>
                        <small style={{ color: '#64748b' }}>
                          {Number(h.lat).toFixed(4)}, {Number(h.lng).toFixed(4)}
                        </small>
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleSaveBeds(h.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingHospitalId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStartEdit(h)}
                          >
                            Update Beds
                          </button>
                        )}
                      </td>
                      {user?.role === 'admin' && (
                        <td>
                          <button
                            type="button"
                            className="btn-delete"
                            onClick={() => handleDeleteHospital(h.id)}
                            title="Remove hospital"
                          >
                            🗑️
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
});
