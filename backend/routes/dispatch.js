const express = require('express');
const pool = require('../db/pool');
const { writeAudit } = require('../utils/audit');
const { requireAuth, requireControlRoom } = require('../middleware/auth');
const {
  canTransitionTripStatus,
  isUuid,
  validateSosRequest,
  validateTripStatusUpdate
} = require('../utils/validation');

const router = express.Router();
const readCache = new Map();

function getCached(key, ttlMs, loader) {
  const cached = readCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }
  return loader().then((value) => {
    readCache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  });
}

function invalidateDispatchCache() {
  readCache.clear();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of readCache) {
    if (entry.expiresAt <= now) readCache.delete(key);
  }
}, 30000).unref();

router.get('/map-overview', async (req, res, next) => {
  try {
    const overview = await getCached('map-overview', 5000, async () => {
      const [ambulances, hospitals, incidents] = await Promise.all([
      pool.query(`
        SELECT id, vehicle_number, driver_name, status,
               ST_Y(location::geometry) AS lat,
               ST_X(location::geometry) AS lng
        FROM ambulances
        WHERE status != 'offline'
        ORDER BY vehicle_number
      `),
      pool.query(`
        SELECT id, name, specialties, er_beds_available,
               ST_Y(location::geometry) AS lat,
               ST_X(location::geometry) AS lng
        FROM hospitals
        ORDER BY name
      `),
      pool.query(`
        SELECT r.id, r.emergency_type, r.status,
               ST_Y(r.location::geometry) AS lat,
               ST_X(r.location::geometry) AS lng,
               r.created_at
        FROM emergency_requests r
        WHERE r.status IN ('pending', 'assigned')
          AND r.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY r.created_at DESC
        LIMIT 50
      `)
      ]);

      return {
        ambulances: ambulances.rows,
        hospitals: hospitals.rows,
        incidents: incidents.rows,
        refreshedAt: new Date().toISOString()
      };
    });
    res.set('Cache-Control', 'public, max-age=5');
    return res.json(overview);
  } catch (error) {
    return next(error);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const dashboard = await getCached('dashboard', 3000, async () => {
      const [statsResult, requestsResult] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM emergency_requests
            WHERE created_at >= CURRENT_DATE)::INTEGER AS requests_today,
           (SELECT COUNT(*) FROM trips
            WHERE status IN ('dispatched', 'en_route', 'arrived'))::INTEGER AS active_trips,
           (SELECT COUNT(*) FROM ambulances WHERE status = 'available')::INTEGER
             AS available_ambulances,
           (SELECT COUNT(*) FROM ambulances WHERE status = 'busy')::INTEGER
             AS busy_ambulances,
           (SELECT COUNT(*) FROM hospitals)::INTEGER AS hospitals_count,
           COALESCE((SELECT SUM(er_beds_available) FROM hospitals), 0)::INTEGER
             AS er_beds_available`
      ),
      pool.query(
        `SELECT r.id AS request_id, r.emergency_type, r.status AS request_status,
                r.created_at AS request_created_at,
                t.id AS trip_id, t.status AS trip_status,
                a.vehicle_number
         FROM emergency_requests r
         LEFT JOIN trips t ON t.request_id = r.id
         LEFT JOIN ambulances a ON a.id = t.ambulance_id
         ORDER BY r.created_at DESC
         LIMIT 8`
      )
      ]);

      return {
        stats: statsResult.rows[0],
        recentRequests: requestsResult.rows
      };
    });
    res.set('Cache-Control', 'public, max-age=3');
    return res.json(dashboard);
  } catch (error) {
    return next(error);
  }
});

router.post('/sos', async (req, res, next) => {
  const validationError = validateSosRequest(req.body);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const {
    lat,
    lng,
    emergencyType,
    patientName,
    patientAge,
    patientGender,
    contactPhone,
    medicalNotes,
    conscious,
    breathing,
    vitals
  } = req.body;
  const normalizedVitals = vitals && typeof vitals === 'object'
    ? Object.fromEntries(
      Object.entries(vitals)
        .filter(([, value]) => value !== '' && value !== null && value !== undefined)
        .map(([key, value]) => [key, Number.isFinite(Number(value)) ? Number(value) : value])
    )
    : {};
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `INSERT INTO emergency_requests (
         emergency_type, location, patient_name, patient_age, patient_gender,
         contact_phone, medical_notes, conscious, breathing, vitals
       )
       VALUES (
         $1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
         NULLIF($4, ''), NULLIF($5, '')::integer, NULLIF($6, ''),
         NULLIF($7, ''), NULLIF($8, ''), $9, $10, $11::jsonb
       )
       RETURNING id`,
      [
        emergencyType,
        lng,
        lat,
        patientName || '',
        patientAge || '',
        patientGender || '',
        contactPhone || '',
        medicalNotes || '',
        conscious ?? null,
        breathing ?? null,
        JSON.stringify(normalizedVitals)
      ]
    );
    const requestId = requestResult.rows[0].id;

    let hospitalResult = await client.query(
      `SELECT id, name, er_beds_available, icu_beds_available,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM hospitals
       WHERE er_beds_available > 0
         AND $1 = ANY(specialties)
         AND ST_DWithin(
           location,
           ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
           25000
         )
       ORDER BY ST_Distance(
         location,
         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
       )
       LIMIT 1
       FOR UPDATE`,
      [emergencyType, lng, lat]
    );

    // Fallback: Check nearest hospital with matching specialty regardless of distance
    if (hospitalResult.rowCount === 0) {
      hospitalResult = await client.query(
        `SELECT id, name, er_beds_available, icu_beds_available,
                ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM hospitals
         WHERE er_beds_available > 0
           AND $1 = ANY(specialties)
         ORDER BY ST_Distance(
           location,
           ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
         )
         LIMIT 1
         FOR UPDATE`,
        [emergencyType, lng, lat]
      );
    }

    // Secondary fallback: Check any hospital with an available bed
    if (hospitalResult.rowCount === 0) {
      hospitalResult = await client.query(
        `SELECT id, name, er_beds_available, icu_beds_available,
                ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM hospitals
         WHERE er_beds_available > 0
         ORDER BY ST_Distance(
           location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         )
         LIMIT 1
         FOR UPDATE`,
        [lng, lat]
      );
    }

    if (hospitalResult.rowCount === 0) {
      await client.query(
        "UPDATE emergency_requests SET status = 'unassigned' WHERE id = $1",
        [requestId]
      );
      await client.query('COMMIT');
      invalidateDispatchCache();
      await writeAudit({
        action: 'emergency_request_unassigned',
        entityType: 'emergency_request',
        entityId: requestId,
        details: { emergencyType, reason: 'no_hospital' },
        req
      });
      req.app.locals.io?.to('control_room').emit('emergency_notification', {
        id: requestId,
        type: 'unassigned',
        title: 'Emergency request needs assistance',
        message: 'No hospital with an available ER bed is registered.',
        emergencyType,
        createdAt: new Date().toISOString()
      });
      return res.status(409).json({
        message: 'No hospital with an available ER bed could be found in the network.',
        requestId
      });
    }

    let ambulanceResult = await client.query(
      `SELECT id, vehicle_number, driver_name, type, status,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM ambulances
       WHERE status = 'available'
         AND ST_DWithin(
           location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           25000
         )
       ORDER BY ST_Distance(
         location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       )
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [lng, lat]
    );

    // Fallback: Check nearest available ambulance regardless of distance
    if (ambulanceResult.rowCount === 0) {
      ambulanceResult = await client.query(
        `SELECT id, vehicle_number, driver_name, type, status,
                ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM ambulances
         WHERE status = 'available'
         ORDER BY ST_Distance(
           location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         )
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [lng, lat]
      );
    }

    // Secondary fallback: If all ambulances are busy or offline, pick the nearest one to re-dispatch
    if (ambulanceResult.rowCount === 0) {
      ambulanceResult = await client.query(
        `SELECT id, vehicle_number, driver_name, type, status,
                ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM ambulances
         ORDER BY ST_Distance(
           location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         )
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [lng, lat]
      );
    }

    if (ambulanceResult.rowCount === 0) {
      await client.query(
        "UPDATE emergency_requests SET status = 'unassigned' WHERE id = $1",
        [requestId]
      );
      await client.query('COMMIT');
      invalidateDispatchCache();
      await writeAudit({
        action: 'emergency_request_unassigned',
        entityType: 'emergency_request',
        entityId: requestId,
        details: { emergencyType, reason: 'no_ambulance' },
        req
      });
      req.app.locals.io?.to('control_room').emit('emergency_notification', {
        id: requestId,
        type: 'unassigned',
        title: 'Emergency request needs assistance',
        message: 'No ambulances are registered in the fleet.',
        emergencyType,
        createdAt: new Date().toISOString()
      });
      return res.status(409).json({
        message: 'No ambulance units are registered in the fleet.',
        requestId
      });
    }

    const ambulance = ambulanceResult.rows[0];
    const hospital = hospitalResult.rows[0];
    await client.query(
      `UPDATE hospitals
       SET er_beds_available = er_beds_available - 1, updated_at = NOW()
       WHERE id = $1`,
      [hospital.id]
    );
    await client.query(
      `UPDATE ambulances
       SET status = 'busy', updated_at = NOW()
       WHERE id = $1`,
      [ambulance.id]
    );
    const tripResult = await client.query(
      `INSERT INTO trips (request_id, ambulance_id, hospital_id)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [requestId, ambulance.id, hospital.id]
    );
    await client.query(
      "UPDATE emergency_requests SET status = 'assigned' WHERE id = $1",
      [requestId]
    );

    await client.query('COMMIT');
    invalidateDispatchCache();
    await writeAudit({
      action: 'emergency_request_dispatched',
      entityType: 'emergency_request',
      entityId: requestId,
      details: {
        tripId: tripResult.rows[0].id,
        emergencyType,
        vehicleNumber: ambulance.vehicle_number,
        hospitalName: hospital.name
      },
      req
    });
    req.app.locals.io?.to('control_room').emit('emergency_notification', {
      id: requestId,
      tripId: tripResult.rows[0].id,
      type: 'assigned',
      title: `${emergencyType} emergency dispatched`,
      message: `${ambulance.vehicle_number} assigned to a nearby ${hospital.name}.`,
      emergencyType,
      vehicleNumber: ambulance.vehicle_number,
      hospitalName: hospital.name,
      createdAt: new Date().toISOString()
    });
    return res.status(201).json({
      tripId: tripResult.rows[0].id,
      requestId,
      status: tripResult.rows[0].status,
      ambulance,
      hospital: {
        ...hospital,
        er_beds_available: hospital.er_beds_available - 1
      }
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Could not roll back SOS dispatch transaction:', rollbackError);
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/requests/:requestId', async (req, res, next) => {
  const { requestId } = req.params;
  if (!isUuid(requestId)) {
    return res.status(400).json({ message: 'requestId must be a valid UUID.' });
  }

  try {
    const result = await pool.query(
      `SELECT r.id AS request_id, r.emergency_type, r.status AS request_status,
              r.created_at AS request_created_at,
              r.patient_name, r.patient_age, r.patient_gender,
              r.contact_phone, r.medical_notes, r.conscious, r.breathing, r.vitals,
              ST_Y(r.location::geometry) AS request_lat,
              ST_X(r.location::geometry) AS request_lng,
              t.id AS trip_id, t.status AS trip_status,
              t.created_at AS trip_created_at, t.updated_at AS trip_updated_at,
              a.id AS ambulance_id, a.vehicle_number, a.driver_name,
              a.type AS ambulance_type, a.status AS ambulance_status,
              ST_Y(a.location::geometry) AS ambulance_lat,
              ST_X(a.location::geometry) AS ambulance_lng,
              h.id AS hospital_id, h.name AS hospital_name,
              h.er_beds_available, h.icu_beds_available,
              ST_Y(h.location::geometry) AS hospital_lat,
              ST_X(h.location::geometry) AS hospital_lng
       FROM emergency_requests r
       LEFT JOIN trips t ON t.request_id = r.id
       LEFT JOIN ambulances a ON a.id = t.ambulance_id
       LEFT JOIN hospitals h ON h.id = t.hospital_id
       WHERE r.id = $1`,
      [requestId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Emergency request not found.' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.get('/trips/:tripId', async (req, res, next) => {
  const { tripId } = req.params;
  if (!isUuid(tripId)) {
    return res.status(400).json({ message: 'tripId must be a valid UUID.' });
  }

  try {
    const result = await pool.query(
      `SELECT t.id AS trip_id, t.request_id, t.status, t.created_at, t.updated_at,
              a.id AS ambulance_id, a.vehicle_number, a.driver_name,
              a.type AS ambulance_type, a.status AS ambulance_status,
              ST_Y(a.location::geometry) AS ambulance_lat,
              ST_X(a.location::geometry) AS ambulance_lng,
              h.id AS hospital_id, h.name AS hospital_name,
              h.er_beds_available, h.icu_beds_available,
              ST_Y(h.location::geometry) AS hospital_lat,
              ST_X(h.location::geometry) AS hospital_lng,
              r.emergency_type, r.patient_name, r.patient_age, r.patient_gender,
              r.contact_phone, r.medical_notes, r.conscious, r.breathing, r.vitals,
              ST_Y(r.location::geometry) AS request_lat,
              ST_X(r.location::geometry) AS request_lng
       FROM trips t
       JOIN ambulances a ON a.id = t.ambulance_id
       JOIN hospitals h ON h.id = t.hospital_id
       JOIN emergency_requests r ON r.id = t.request_id
       WHERE t.id = $1`,
      [tripId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Trip not found.' });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.get('/trips/:tripId/history', async (req, res, next) => {
  const { tripId } = req.params;
  if (!isUuid(tripId)) {
    return res.status(400).json({ message: 'tripId must be a valid UUID.' });
  }

  try {
    const result = await pool.query(
      `SELECT ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng,
              recorded_at
       FROM location_history
       WHERE trip_id = $1
       ORDER BY recorded_at ASC
       LIMIT 500`,
      [tripId],
    );
    return res.json({ tripId, history: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/trips/:tripId/gps/reset', async (req, res, next) => {
  const { tripId } = req.params;
  if (!isUuid(tripId)) {
    return res.status(400).json({ message: 'tripId must be a valid UUID.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tripResult = await client.query(
      `SELECT ambulance_id, status
       FROM trips
       WHERE id = $1
       FOR UPDATE`,
      [tripId],
    );

    if (tripResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Trip not found.' });
    }

    const trip = tripResult.rows[0];
    if (trip.status !== 'en_route') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'GPS history can only be reset while the trip is en route.',
      });
    }

    const firstLocation = await client.query(
      `SELECT ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng
       FROM location_history
       WHERE trip_id = $1
       ORDER BY recorded_at ASC
       LIMIT 1`,
      [tripId],
    );

    if (firstLocation.rowCount === 1) {
      await client.query(
        `UPDATE ambulances
         SET location = ST_SetSRID(
               ST_MakePoint($1, $2), 4326
             )::geography,
             updated_at = NOW()
         WHERE id = $3`,
        [firstLocation.rows[0].lng, firstLocation.rows[0].lat, trip.ambulance_id],
      );
    }

    await client.query('DELETE FROM location_history WHERE trip_id = $1', [tripId]);
    await client.query(
      'UPDATE trips SET updated_at = NOW() WHERE id = $1',
      [tripId],
    );
    await client.query('COMMIT');

    return res.json({
      tripId,
      reset: true,
      historyCount: 0,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/trips/:tripId/auto-status', async (req, res, next) => {
  const { tripId } = req.params;
  if (!isUuid(tripId)) {
    return res.status(400).json({ message: 'tripId must be a valid UUID.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tripResult = await client.query(
      `SELECT id, request_id, ambulance_id, hospital_id, status
       FROM trips
       WHERE id = $1
       FOR UPDATE`,
      [tripId]
    );

    if (tripResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Trip not found.' });
    }

    const trip = tripResult.rows[0];
    const nextStatus = {
      dispatched: 'en_route',
      en_route: 'arrived',
      arrived: 'completed'
    }[trip.status];

    if (!nextStatus) {
      await client.query('ROLLBACK');
      return res.json({
        tripId,
        status: trip.status,
        automated: false,
        message: `No automatic step is available from ${trip.status}.`
      });
    }

    await client.query(
      'UPDATE trips SET status = $1, updated_at = NOW() WHERE id = $2',
      [nextStatus, tripId]
    );

    if (nextStatus === 'completed') {
      await client.query(
        `UPDATE ambulances SET status = 'available', updated_at = NOW()
         WHERE id = $1`,
        [trip.ambulance_id]
      );
      await client.query(
        "UPDATE emergency_requests SET status = 'completed' WHERE id = $1",
        [trip.request_id]
      );
    } else if (nextStatus === 'arrived') {
      await client.query(
        `UPDATE ambulances SET status = 'busy', updated_at = NOW()
         WHERE id = $1`,
        [trip.ambulance_id]
      );
    } else if (nextStatus === 'en_route') {
      await client.query(
        `UPDATE ambulances SET status = 'busy', updated_at = NOW()
         WHERE id = $1`,
        [trip.ambulance_id]
      );
      await client.query(
        "UPDATE emergency_requests SET status = 'assigned' WHERE id = $1",
        [trip.request_id]
      );
    }

    await client.query('COMMIT');
    invalidateDispatchCache();
    await writeAudit({
      action: 'trip_status_automated',
      entityType: 'trip',
      entityId: tripId,
      details: {
        requestId: trip.request_id,
        previousStatus: trip.status,
        nextStatus
      },
      req
    });
    req.app.locals.io?.to('control_room').emit('emergency_notification', {
      id: tripId,
      tripId,
      type: 'trip_status',
      title: `Trip automatically changed to ${nextStatus.replace('_', ' ')}`,
      message: `Trip ${tripId.slice(0, 8).toUpperCase()} progressed automatically.`,
      status: nextStatus,
      createdAt: new Date().toISOString()
    });
    return res.json({
      tripId,
      status: nextStatus,
      automated: true
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
});

router.patch('/trips/:tripId/status', async (req, res, next) => {
  const { tripId } = req.params;
  if (!isUuid(tripId)) {
    return res.status(400).json({ message: 'tripId must be a valid UUID.' });
  }

  const validationError = validateTripStatusUpdate(req.body);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tripResult = await client.query(
      `SELECT id, request_id, ambulance_id, hospital_id, status
       FROM trips
       WHERE id = $1
       FOR UPDATE`,
      [tripId]
    );

    if (tripResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Trip not found.' });
    }

    const trip = tripResult.rows[0];
    const nextStatus = req.body.status;
    if (!canTransitionTripStatus(trip.status, nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Trip cannot transition from ${trip.status} to ${nextStatus}.`
      });
    }

    await client.query(
      'UPDATE trips SET status = $1, updated_at = NOW() WHERE id = $2',
      [nextStatus, tripId]
    );

    if (nextStatus === 'cancelled') {
      await client.query(
        `UPDATE ambulances SET status = 'available', updated_at = NOW()
         WHERE id = $1`,
        [trip.ambulance_id]
      );
      await client.query(
        `UPDATE hospitals
         SET er_beds_available = er_beds_available + 1, updated_at = NOW()
         WHERE id = $1`,
        [trip.hospital_id]
      );
      await client.query(
        "UPDATE emergency_requests SET status = 'cancelled' WHERE id = $1",
        [trip.request_id]
      );
    } else if (nextStatus === 'completed') {
      await client.query(
        `UPDATE ambulances SET status = 'available', updated_at = NOW()
         WHERE id = $1`,
        [trip.ambulance_id]
      );
      await client.query(
        "UPDATE emergency_requests SET status = 'completed' WHERE id = $1",
        [trip.request_id]
      );
    }

    await client.query('COMMIT');
    invalidateDispatchCache();
    await writeAudit({
      action: 'trip_status_updated',
      entityType: 'trip',
      entityId: tripId,
      details: {
        requestId: trip.request_id,
        previousStatus: trip.status,
        nextStatus
      },
      req
    });
    req.app.locals.io?.to('control_room').emit('emergency_notification', {
      id: tripId,
      tripId,
      type: 'trip_status',
      title: `Trip ${nextStatus.replace('_', ' ')}`,
      message: `Trip ${tripId.slice(0, 8).toUpperCase()} changed to ${nextStatus.replace('_', ' ')}.`,
      status: nextStatus,
      createdAt: new Date().toISOString()
    });
    return res.json({ tripId, status: nextStatus });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Could not roll back trip status transaction:', rollbackError);
    }
    return next(error);
  } finally {
    client.release();
  }
});

// GET /api/dispatch/requests - List all emergency requests (control_room + admin)
router.get('/requests', requireAuth, requireControlRoom, async (req, res, next) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const allowedStatuses = new Set(['pending', 'assigned', 'dispatched', 'unassigned', 'completed', 'cancelled']);

  const conditions = [];
  const params = [];
  let idx = 1;

  if (status && allowedStatuses.has(status)) {
    conditions.push(`r.status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      pool.query(
        `SELECT r.id, r.emergency_type, r.status AS request_status,
                r.patient_name, r.patient_age, r.patient_gender,
                r.contact_phone, r.conscious, r.breathing,
                r.created_at,
                ST_Y(r.location::geometry) AS lat,
                ST_X(r.location::geometry) AS lng,
                t.id AS trip_id, t.status AS trip_status,
                a.vehicle_number, a.driver_name,
                h.name AS hospital_name
         FROM emergency_requests r
         LEFT JOIN trips t ON t.request_id = r.id
         LEFT JOIN ambulances a ON a.id = t.ambulance_id
         LEFT JOIN hospitals h ON h.id = t.hospital_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::INTEGER AS total FROM emergency_requests r ${where}`,
        params
      )
    ]);

    return res.json({
      requests: rows.rows,
      total: countResult.rows[0].total,
      page,
      limit,
      pages: Math.ceil(countResult.rows[0].total / limit)
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/dispatch/trips - List all trips (control_room + admin)
router.get('/trips', requireAuth, requireControlRoom, async (req, res, next) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const allowedStatuses = new Set(['dispatched', 'en_route', 'arrived', 'completed', 'cancelled']);

  const conditions = [];
  const params = [];
  let idx = 1;

  if (status && allowedStatuses.has(status)) {
    conditions.push(`t.status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows, countResult] = await Promise.all([
      pool.query(
        `SELECT t.id AS trip_id, t.request_id, t.status, t.created_at, t.updated_at,
                a.vehicle_number, a.driver_name, a.type AS ambulance_type,
                a.status AS ambulance_status,
                ST_Y(a.location::geometry) AS ambulance_lat,
                ST_X(a.location::geometry) AS ambulance_lng,
                h.name AS hospital_name,
                h.er_beds_available,
                r.emergency_type,
                ST_Y(r.location::geometry) AS request_lat,
                ST_X(r.location::geometry) AS request_lng
         FROM trips t
         JOIN ambulances a ON a.id = t.ambulance_id
         JOIN hospitals h ON h.id = t.hospital_id
         JOIN emergency_requests r ON r.id = t.request_id
         ${where}
         ORDER BY t.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::INTEGER AS total FROM trips t ${where}`,
        params
      )
    ]);

    return res.json({
      trips: rows.rows,
      total: countResult.rows[0].total,
      page,
      limit,
      pages: Math.ceil(countResult.rows[0].total / limit)
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/dispatch/ambulances/available - available ambulances (control_room + admin)
router.get('/ambulances/available', requireAuth, requireControlRoom, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, vehicle_number, driver_name, type, status, updated_at,
             ST_Y(location::geometry) AS lat,
             ST_X(location::geometry) AS lng
      FROM ambulances
      WHERE status = 'available'
      ORDER BY updated_at DESC
    `);
    return res.json({ ambulances: result.rows });
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/dispatch/trips/:tripId/location - Update live ambulance location (any authenticated user, e.g. driver or simulator)
router.patch('/trips/:tripId/location', async (req, res, next) => {
  const { tripId } = req.params;
  if (!isUuid(tripId)) {
    return res.status(400).json({ message: 'tripId must be a valid UUID.' });
  }

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const etaMinutes = Number(req.body?.etaMinutes);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90
      || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ message: 'Valid lat and lng are required.' });
  }

  try {
    // Update ambulance location
    const tripRow = await pool.query(
      'SELECT ambulance_id FROM trips WHERE id = $1',
      [tripId]
    );
    if (tripRow.rowCount === 0) {
      return res.status(404).json({ message: 'Trip not found.' });
    }
    const ambulanceId = tripRow.rows[0].ambulance_id;

    await pool.query(
      `UPDATE ambulances
       SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           updated_at = NOW()
       WHERE id = $3`,
      [lng, lat, ambulanceId]
    );

    // Insert into location_history
    await pool.query(
      `INSERT INTO location_history (trip_id, ambulance_id, location, recorded_at)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, NOW())`,
      [tripId, ambulanceId, lng, lat]
    );

    // Broadcast live location via Socket.IO to anyone watching this trip (room name matches socket join_trip handler)
    req.app.locals.io?.to(tripId).emit('live_location', {
      tripId,
      lat,
      lng,
      etaMinutes: Number.isFinite(etaMinutes) ? etaMinutes : null,
      recordedAt: new Date().toISOString()
    });

    invalidateDispatchCache();
    return res.json({ tripId, lat, lng, etaMinutes: Number.isFinite(etaMinutes) ? etaMinutes : null });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

