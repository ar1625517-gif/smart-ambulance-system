const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canTransitionTripStatus,
  isUuid,
  validateSosRequest,
  validateTripStatusUpdate
} = require('./validation');

test('accepts a valid SOS request', () => {
  assert.equal(
    validateSosRequest({ lat: 12.97, lng: 77.59, emergencyType: 'Trauma' }),
    null
  );
});

test('rejects invalid coordinates and unknown emergency types', () => {
  assert.match(
    validateSosRequest({ lat: 91, lng: 77.59, emergencyType: 'Trauma' }),
    /lat/
  );
  assert.match(
    validateSosRequest({ lat: 12.97, lng: 181, emergencyType: 'Trauma' }),
    /lng/
  );
  assert.match(
    validateSosRequest({ lat: 12.97, lng: 77.59, emergencyType: 'Unknown' }),
    /emergencyType/
  );
});

test('rejects missing or non-object payloads', () => {
  assert.match(validateSosRequest(null), /JSON object/);
  assert.match(validateSosRequest([]), /JSON object/);
});

test('accepts patient details and validates vitals', () => {
  assert.equal(
    validateSosRequest({
      lat: 12.97,
      lng: 77.59,
      emergencyType: 'Cardiology',
      patientName: 'Test Patient',
      patientAge: 45,
      conscious: true,
      breathing: true,
      vitals: { heartRate: 82, oxygenSaturation: 97 }
    }),
    null
  );
  assert.match(
    validateSosRequest({
      lat: 12.97,
      lng: 77.59,
      emergencyType: 'Trauma',
      patientAge: 121
    }),
    /patientAge/
  );
  assert.match(
    validateSosRequest({
      lat: 12.97,
      lng: 77.59,
      emergencyType: 'Trauma',
      vitals: { heartRate: 'unknown' }
    }),
    /heartRate/
  );
});

test('allows valid trip status progression and blocks invalid transitions', () => {
  assert.equal(canTransitionTripStatus('dispatched', 'en_route'), true);
  assert.equal(canTransitionTripStatus('arrived', 'completed'), true);
  assert.equal(canTransitionTripStatus('dispatched', 'completed'), false);
  assert.equal(canTransitionTripStatus('completed', 'cancelled'), false);
  assert.equal(validateTripStatusUpdate({ status: 'arrived' }), null);
  assert.match(validateTripStatusUpdate({ status: 'unknown' }), /status/);
});

test('accepts UUID resource identifiers only', () => {
  assert.equal(isUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
  assert.equal(isUuid('not-a-uuid'), false);
});
