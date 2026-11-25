// Centralized API service layer for MediRoute

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, options);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = (typeof data === 'object' ? data?.message : data) || `HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status, data });
  }
  return data;
}

// --- Auth ---
export const authApi = {
  login: (username, password) =>
    request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }),

  me: (token) =>
    request('/api/auth/me', { headers: authHeader(token) }),

  listUsers: (token) =>
    request('/api/auth/users', { headers: authHeader(token) }),

  createUser: (token, payload) =>
    request('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(payload)
    }),

  updateUser: (token, userId, payload) =>
    request(`/api/auth/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(payload)
    })
};

// --- Dispatch ---
export const dispatchApi = {
  dashboard: () => request('/api/dispatch/dashboard'),

  mapOverview: () => request('/api/dispatch/map-overview'),

  submitSos: (payload) =>
    request('/api/dispatch/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),

  getRequest: (requestId) =>
    request(`/api/dispatch/requests/${requestId}`),

  listRequests: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/dispatch/requests${qs ? `?${qs}` : ''}`, {
      headers: authHeader(token)
    });
  },

  listTrips: (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/dispatch/trips${qs ? `?${qs}` : ''}`, {
      headers: authHeader(token)
    });
  },

  getTrip: (tripId) => request(`/api/dispatch/trips/${tripId}`),

  getTripHistory: (tripId) => request(`/api/dispatch/trips/${tripId}/history`),

  updateTripStatus: (tripId, status) =>
    request(`/api/dispatch/trips/${tripId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    }),

  autoAdvanceTrip: (tripId) =>
    request(`/api/dispatch/trips/${tripId}/auto-status`, { method: 'POST' }),

  resetGpsHistory: (tripId) =>
    request(`/api/dispatch/trips/${tripId}/gps/reset`, { method: 'POST' }),

  updateTripLocation: (tripId, payload) =>
    request(`/api/dispatch/trips/${tripId}/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),

  availableAmbulances: (token) =>
    request('/api/dispatch/ambulances/available', { headers: authHeader(token) })
};

// --- Management ---
export const managementApi = {
  resources: (token) =>
    request('/api/management/resources', { headers: authHeader(token) }),

  createAmbulance: (token, payload) =>
    request('/api/management/ambulances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(payload)
    }),

  deleteAmbulance: (token, ambulanceId) =>
    request(`/api/management/ambulances/${ambulanceId}`, {
      method: 'DELETE',
      headers: authHeader(token)
    }),

  updateAmbulanceStatus: (token, ambulanceId, status) =>
    request(`/api/management/ambulances/${ambulanceId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ status })
    }),

  createHospital: (token, payload) =>
    request('/api/management/hospitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(payload)
    }),

  deleteHospital: (token, hospitalId) =>
    request(`/api/management/hospitals/${hospitalId}`, {
      method: 'DELETE',
      headers: authHeader(token)
    }),

  updateHospitalBeds: (token, hospitalId, erBeds, icuBeds) =>
    request(`/api/management/hospitals/${hospitalId}/beds`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ erBeds, icuBeds })
    }),

  syncRealWorld: (token, payload) =>
    request('/api/management/sync-real-world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(payload)
    }),

  driverAssignment: (token, ambulanceId) => {
    const qs = ambulanceId ? `?ambulanceId=${ambulanceId}` : '';
    return request(`/api/management/driver/assignment${qs}`, { headers: authHeader(token) });
  },

  claimVehicle: (token, ambulanceId) =>
    request('/api/management/driver/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ ambulanceId })
    }),

  hospitalIncoming: (token, hospitalId) => {
    const qs = hospitalId ? `?hospitalId=${hospitalId}` : '';
    return request(`/api/management/hospital/incoming${qs}`, { headers: authHeader(token) });
  }
};

// --- Admin ---
export const adminApi = {
  analytics: (token) =>
    request('/api/admin/analytics', { headers: authHeader(token) }),

  auditLogs: (token, limit) =>
    request(`/api/admin/audit${limit ? `?limit=${limit}` : ''}`, { headers: authHeader(token) }),

  retentionCleanup: (token, days) =>
    request('/api/admin/maintenance/retention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ days })
    }),

  downloadReport: async (token, reportName) => {
    const response = await fetch(`${API_BASE}/api/admin/reports/${reportName}.csv`, {
      headers: authHeader(token)
    });
    if (!response.ok) throw new Error(`Failed to download ${reportName} report`);
    return response.blob();
  },

  downloadBackup: async (token) => {
    const response = await fetch(`${API_BASE}/api/admin/reports/backup.json`, {
      headers: authHeader(token)
    });
    if (!response.ok) throw new Error('Failed to download backup');
    return response.blob();
  }
};

// Helper: trigger file download from a Blob
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Helper: Nominatim reverse geocode
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}
