const EMERGENCY_TYPES = new Set(['Trauma', 'Cardiology', 'Neurology', 'General']);
const TRIP_STATUSES = new Set(['en_route', 'arrived', 'completed', 'cancelled']);
const TRIP_STATUS_TRANSITIONS = {
  dispatched: new Set(['en_route', 'cancelled']),
  en_route: new Set(['arrived', 'cancelled']),
  arrived: new Set(['completed']),
  completed: new Set(),
  cancelled: new Set()
};

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function validateSosRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }

  const { lat, lng, emergencyType } = body;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return 'lat must be a number between -90 and 90.';
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return 'lng must be a number between -180 and 180.';
  }
  if (typeof emergencyType !== 'string' || !EMERGENCY_TYPES.has(emergencyType)) {
    return `emergencyType must be one of: ${Array.from(EMERGENCY_TYPES).join(', ')}.`;
  }

  const optionalTextFields = [
    ['patientName', 'patientName'],
    ['patientGender', 'patientGender'],
    ['contactPhone', 'contactPhone'],
    ['medicalNotes', 'medicalNotes']
  ];
  for (const [field, label] of optionalTextFields) {
    if (body[field] !== undefined
        && (typeof body[field] !== 'string' || body[field].length > 500)) {
      return `${label} must be a string with at most 500 characters.`;
    }
  }
  if (body.patientAge !== undefined
      && body.patientAge !== ''
      && (!Number.isInteger(body.patientAge) || body.patientAge < 0 || body.patientAge > 120)) {
    return 'patientAge must be an integer between 0 and 120.';
  }
  if (body.conscious !== undefined && typeof body.conscious !== 'boolean') {
    return 'conscious must be true or false.';
  }
  if (body.breathing !== undefined && typeof body.breathing !== 'boolean') {
    return 'breathing must be true or false.';
  }
  if (body.vitals !== undefined) {
    if (!body.vitals || typeof body.vitals !== 'object' || Array.isArray(body.vitals)) {
      return 'vitals must be a JSON object.';
    }
    for (const field of ['heartRate', 'systolicBp', 'oxygenSaturation', 'respiratoryRate', 'temperature']) {
      if (body.vitals[field] !== undefined
          && body.vitals[field] !== ''
          && !Number.isFinite(Number(body.vitals[field]))) {
        return `${field} must be a number.`;
      }
    }
  }

  return null;
}

function validateTripStatusUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }
  if (typeof body.status !== 'string' || !TRIP_STATUSES.has(body.status)) {
    return `status must be one of: ${Array.from(TRIP_STATUSES).join(', ')}.`;
  }
  return null;
}

function canTransitionTripStatus(currentStatus, nextStatus) {
  return TRIP_STATUS_TRANSITIONS[currentStatus]?.has(nextStatus) === true;
}

module.exports = {
  canTransitionTripStatus,
  isUuid,
  validateSosRequest,
  validateTripStatusUpdate
};
