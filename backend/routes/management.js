const express = require('express');
const pool = require('../db/pool');
const { writeAudit } = require('../utils/audit');
const { syncRealWorldDataToDb } = require('../utils/realWorldData');
const { requireAuth, requireAdmin, requireControlRoom, requireHospitalStaff, requireDriver } = require('../middleware/auth');

const router = express.Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// POST /api/management/ambulances - Create ambulance (admin/control_room)
router.post('/ambulances', requireControlRoom, async (req, res, next) => {
  const { vehicleNumber, driverName, type, lat, lng } = req.body || {};

  if (typeof vehicleNumber !== 'string' || !vehicleNumber.trim()
      || typeof driverName !== 'string' || !driverName.trim()
      || !['BLS', 'ALS'].includes(type)
      || !Number.isFinite(Number(lat)) || Number(lat) < -90 || Number(lat) > 90
      || !Number.isFinite(Number(lng)) || Number(lng) < -180 || Number(lng) > 180) {
    return res.status(400).json({
      message: 'vehicleNumber, driverName, type (BLS/ALS), lat, and lng are required.'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO ambulances (vehicle_number, driver_name, type, location)
      VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
      RETURNING id, vehicle_number, driver_name, type, status
    `, [vehicleNumber.trim(), driverName.trim(), type, Number(lng), Number(lat)]);
    await writeAudit({
      action: 'ambulance_created',
      entityType: 'ambulance',
      entityId: result.rows[0].id,
      actorId: req.user?.sub,
      actorName: req.user?.username,
      details: { vehicleNumber: result.rows[0].vehicle_number },
      req
    });
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An ambulance with this vehicle number already exists.' });
    }
    return next(error);
  }
});

// DELETE /api/management/ambulances/:id - Admin only
router.delete('/ambulances/:ambulanceId', requireAuth, requireAdmin, async (req, res, next) => {
  if (!UUID_PATTERN.test(req.params.ambulanceId)) {
    return res.status(400).json({ message: 'ambulanceId must be a valid UUID.' });
  }
  try {
    const result = await pool.query(
      'DELETE FROM ambulances WHERE id = $1 RETURNING id, vehicle_number',
      [req.params.ambulanceId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Ambulance not found.' });
    }
    await writeAudit({
      action: 'ambulance_deleted',
      entityType: 'ambulance',
      entityId: req.params.ambulanceId,
      actorId: req.user?.sub,
      actorName: req.user?.username,
      details: { vehicleNumber: result.rows[0].vehicle_number },
      req
    });
    return res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    return next(error);
  }
});

// POST /api/management/hospitals - Create hospital (admin/control_room)
router.post('/hospitals', requireControlRoom, async (req, res, next) => {
  const { name, specialties, erBeds, icuBeds, lat, lng, contactPhone } = req.body || {};
  const allowedSpecialties = new Set(['Trauma', 'Cardiology', 'Neurology', 'General']);
  const normalizedSpecialties = Array.isArray(specialties)
    ? [...new Set(specialties.filter((item) => allowedSpecialties.has(item)))]
    : [];
  const erCount = Number(erBeds);
  const icuCount = Number(icuBeds);

  if (typeof name !== 'string' || !name.trim()
      || normalizedSpecialties.length === 0
      || !Number.isInteger(erCount) || erCount < 0
      || !Number.isInteger(icuCount) || icuCount < 0
      || !Number.isFinite(Number(lat)) || Number(lat) < -90 || Number(lat) > 90
      || !Number.isFinite(Number(lng)) || Number(lng) < -180 || Number(lng) > 180) {
    return res.status(400).json({
      message: 'name, specialties, non-negative ER/ICU bed counts, lat, and lng are required.'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO hospitals
        (name, specialties, er_beds_available, icu_beds_available, location, contact_phone)
      VALUES (
        $1, $2, $3, $4,
        ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
        $7
      )
      RETURNING id, name, specialties, er_beds_available, icu_beds_available, contact_phone
    `, [name.trim(), normalizedSpecialties, erCount, icuCount, Number(lng), Number(lat), contactPhone || null]);
    await writeAudit({
      action: 'hospital_created',
      entityType: 'hospital',
      entityId: result.rows[0].id,
      actorId: req.user?.sub,
      actorName: req.user?.username,
      details: { name: result.rows[0].name },
      req
    });
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A hospital with this name already exists.' });
    }
    return next(error);
  }
});

// DELETE /api/management/hospitals/:id - Admin only
router.delete('/hospitals/:hospitalId', requireAuth, requireAdmin, async (req, res, next) => {
  if (!UUID_PATTERN.test(req.params.hospitalId)) {
    return res.status(400).json({ message: 'hospitalId must be a valid UUID.' });
  }
  try {
    const result = await pool.query(
      'DELETE FROM hospitals WHERE id = $1 RETURNING id, name',
      [req.params.hospitalId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Hospital not found.' });
    }
    await writeAudit({
      action: 'hospital_deleted',
      entityType: 'hospital',
      entityId: req.params.hospitalId,
      actorId: req.user?.sub,
      actorName: req.user?.username,
      details: { name: result.rows[0].name },
      req
    });
    return res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    return next(error);
  }
});

// POST /api/management/sync-real-world
router.post('/sync-real-world', requireControlRoom, async (req, res, next) => {
  const { lat, lng, city } = req.body || {};

  try {
    const result = await syncRealWorldDataToDb(pool, { lat, lng, city });

    await writeAudit({
      action: 'real_world_sync',
      entityType: 'database',
      actorId: req.user?.sub,
      actorName: req.user?.username,
      details: {
        city: city || 'GPS',
        hospitalsCount: result.hospitalsCount,
        ambulancesCount: result.ambulancesCount
      },
      req
    });

    req.app.locals.io?.to('control_room').emit('emergency_notification', {
      id: 'real-world-sync-' + Date.now(),
      type: 'system',
      title: 'Real-World Network Synced',
      message: `Active fleet updated: ${result.hospitalsCount} live hospitals and ${result.ambulancesCount} ambulance drivers deployed.`,
      createdAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: `Successfully synchronized ${result.hospitalsCount} real-world hospitals and deployed ${result.ambulancesCount} ambulances.`,
      ...result
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/management/resources - All resources (any authenticated user)
router.get('/resources', async (req, res, next) => {
  try {
    const [ambulances, hospitals] = await Promise.all([
      pool.query(`
        SELECT id, vehicle_number, driver_name, type, status, driver_user_id, updated_at,
               ST_Y(location::geometry) AS lat,
               ST_X(location::geometry) AS lng
        FROM ambulances
        ORDER BY vehicle_number
      `),
      pool.query(`
        SELECT id, name, specialties, er_beds_available, icu_beds_available,
               contact_phone, updated_at,
               ST_Y(location::geometry) AS lat,
               ST_X(location::geometry) AS lng
        FROM hospitals
        ORDER BY name
      `)
    ]);

    return res.json({
      ambulances: ambulances.rows,
      hospitals: hospitals.rows
    });
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/management/ambulances/:id/status - Control room can update ambulance status
router.patch('/ambulances/:ambulanceId/status', requireControlRoom, async (req, res, next) => {
  const statuses = new Set(['available', 'busy', 'offline']);
  const status = req.body?.status;

  if (!UUID_PATTERN.test(req.params.ambulanceId)) {
    return res.status(400).json({ message: 'ambulanceId must be a valid UUID.' });
  }
  if (!statuses.has(status)) {
    return res.status(400).json({ message: 'status must be available, busy, or offline.' });
  }

  try {
    const result = await pool.query(`
      UPDATE ambulances
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, vehicle_number, driver_name, type, status
    `, [status, req.params.ambulanceId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Ambulance not found.' });
    }
    await writeAudit({
      action: 'ambulance_status_updated',
      entityType: 'ambulance',
      entityId: result.rows[0].id,
      actorId: req.user?.sub,
      actorName: req.user?.username,
      details: { status: result.rows[0].status, vehicleNumber: result.rows[0].vehicle_number },
      req
    });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/management/hospitals/:id/beds - Hospital staff or admin/control_room
router.patch('/hospitals/:hospitalId/beds', requireHospitalStaff, async (req, res, next) => {
  const erBeds = Number(req.body?.erBeds);
  const icuBeds = Number(req.body?.icuBeds);

  if (!UUID_PATTERN.test(req.params.hospitalId)) {
    return res.status(400).json({ message: 'hospitalId must be a valid UUID.' });
  }
  if (!Number.isInteger(erBeds) || erBeds < 0
      || !Number.isInteger(icuBeds) || icuBeds < 0) {
    return res.status(400).json({ message: 'erBeds and icuBeds must be non-negative integers.' });
  }

  // Hospital staff can only update THEIR hospital
  if (req.user?.role === 'hospital_staff') {
    if (!req.user?.hospitalId || req.user.hospitalId !== req.params.hospitalId) {
      return res.status(403).json({ message: 'Hospital staff can only update their assigned hospital.' });
    }
  }

  try {
    const result = await pool.query(`
      UPDATE hospitals
      SET er_beds_available = $1,
          icu_beds_available = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING id, name, specialties, er_beds_available, icu_beds_available
    `, [erBeds, icuBeds, req.params.hospitalId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Hospital not found.' });
    }
    await writeAudit({
      action: 'hospital_beds_updated',
      entityType: 'hospital',
      entityId: result.rows[0].id,
      actorId: req.user?.sub,
      actorName: req.user?.username,
      details: {
        erBeds: result.rows[0].er_beds_available,
        icuBeds: result.rows[0].icu_beds_available
      },
      req
    });

    // Notify control room
    req.app.locals.io?.to('control_room').emit('emergency_notification', {
      id: `hospital-capacity-${result.rows[0].id}-${Date.now()}`,
      type: 'hospital_update',
      title: 'Hospital Capacity Updated',
      message: `${result.rows[0].name}: ${erBeds} ER beds, ${icuBeds} ICU beds available.`,
      createdAt: new Date().toISOString()
    });

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

// POST /api/management/driver/claim - Driver links an ambulance to their profile
router.post('/driver/claim', requireAuth, requireDriver, async (req, res, next) => {
  const { ambulanceId } = req.body || {};
  if (!UUID_PATTERN.test(ambulanceId)) {
    return res.status(400).json({ message: 'Valid ambulanceId is required.' });
  }
  try {
    // Unlink any other ambulance previously claimed by this driver
    await pool.query('UPDATE ambulances SET driver_user_id = NULL WHERE driver_user_id = $1', [req.user.sub]);
    // Link selected ambulance
    const result = await pool.query(
      `UPDATE ambulances SET driver_user_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, vehicle_number, driver_name, type, status`,
      [req.user.sub, ambulanceId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Ambulance not found.' });
    }
    return res.json({ success: true, ambulance: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

// GET /api/management/driver/assignment - Driver gets their current assigned trip
router.get('/driver/assignment', requireAuth, requireDriver, async (req, res, next) => {
  try {
    // Get all ambulances so user can switch operating vehicle if needed
    const allAmbulances = await pool.query(
      `SELECT id, vehicle_number, driver_name, type, status, driver_user_id,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM ambulances
       ORDER BY vehicle_number`
    );

    let ambulance = null;

    // 1. Check if specific ambulance was requested via query param
    if (req.query.ambulanceId && UUID_PATTERN.test(req.query.ambulanceId)) {
      const match = allAmbulances.rows.find((a) => a.id === req.query.ambulanceId);
      if (match) ambulance = match;
    }

    // 2. Check if ambulance is explicitly linked to this user
    if (!ambulance) {
      const linked = allAmbulances.rows.find((a) => a.driver_user_id === req.user.sub);
      if (linked) ambulance = linked;
    }

    // 3. Fallback: Find first ambulance with an active trip, or first available ambulance
    if (!ambulance && allAmbulances.rowCount > 0) {
      const activeTripAmb = await pool.query(
        `SELECT ambulance_id FROM trips
         WHERE status NOT IN ('completed', 'cancelled')
         ORDER BY created_at DESC LIMIT 1`
      );
      if (activeTripAmb.rowCount > 0) {
        ambulance = allAmbulances.rows.find((a) => a.id === activeTripAmb.rows[0].ambulance_id) || allAmbulances.rows[0];
      } else {
        ambulance = allAmbulances.rows[0];
      }
    }

    if (!ambulance) {
      return res.json({ assignment: null, ambulance: null, ambulances: [], message: 'No ambulances registered.' });
    }

    // Find active trip for this ambulance
    const tripResult = await pool.query(
      `SELECT t.id AS trip_id, t.status, t.created_at, t.updated_at,
              r.id AS request_id, r.emergency_type,
              r.patient_name, r.conscious, r.breathing, r.medical_notes, r.vitals,
              ST_Y(r.location::geometry) AS request_lat,
              ST_X(r.location::geometry) AS request_lng,
              h.id AS hospital_id, h.name AS hospital_name,
              h.contact_phone AS hospital_phone,
              ST_Y(h.location::geometry) AS hospital_lat,
              ST_X(h.location::geometry) AS hospital_lng
       FROM trips t
       JOIN emergency_requests r ON r.id = t.request_id
       JOIN hospitals h ON h.id = t.hospital_id
       WHERE t.ambulance_id = $1
         AND t.status NOT IN ('completed', 'cancelled')
       ORDER BY t.created_at DESC
       LIMIT 1`,
      [ambulance.id]
    );

    return res.json({
      ambulance,
      assignment: tripResult.rowCount > 0 ? tripResult.rows[0] : null,
      ambulances: allAmbulances.rows
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/management/hospital/incoming - Hospital staff sees incoming ambulances
router.get('/hospital/incoming', requireAuth, requireHospitalStaff, async (req, res, next) => {
  try {
    // Get all hospitals so user can monitor any facility
    const allHospitals = await pool.query(
      `SELECT id, name, er_beds_available, icu_beds_available, updated_at
       FROM hospitals ORDER BY name`
    );

    // Find hospital linked to this user
    const userResult = await pool.query(
      'SELECT hospital_id FROM control_room_users WHERE id = $1',
      [req.user.sub]
    );

    let hospitalId = userResult.rows[0]?.hospital_id;

    // Admin or staff can pass ?hospitalId= param
    if (req.query.hospitalId && UUID_PATTERN.test(req.query.hospitalId)) {
      hospitalId = req.query.hospitalId;
    }

    // Fallback: If no hospital linked, pick the one with active trips or first hospital
    if (!hospitalId && allHospitals.rowCount > 0) {
      const activeTripHosp = await pool.query(
        `SELECT hospital_id FROM trips
         WHERE status NOT IN ('completed', 'cancelled')
         ORDER BY created_at DESC LIMIT 1`
      );
      if (activeTripHosp.rowCount > 0) {
        hospitalId = activeTripHosp.rows[0].hospital_id;
      } else {
        hospitalId = allHospitals.rows[0].id;
      }
    }

    if (!hospitalId) {
      return res.json({ incoming: [], hospital: null, hospitals: [], message: 'No hospitals registered.' });
    }

    const [result, hospitalResult] = await Promise.all([
      pool.query(
        `SELECT t.id AS trip_id, t.status, t.created_at, t.updated_at,
                a.vehicle_number, a.driver_name, a.type AS ambulance_type,
                ST_Y(a.location::geometry) AS ambulance_lat,
                ST_X(a.location::geometry) AS ambulance_lng,
                r.emergency_type, r.patient_name, r.patient_age, r.patient_gender,
                r.conscious, r.breathing, r.medical_notes, r.vitals
         FROM trips t
         JOIN ambulances a ON a.id = t.ambulance_id
         JOIN emergency_requests r ON r.id = t.request_id
         WHERE t.hospital_id = $1
           AND t.status NOT IN ('completed', 'cancelled')
         ORDER BY t.created_at DESC`,
        [hospitalId]
      ),
      pool.query(
        `SELECT id, name, er_beds_available, icu_beds_available, contact_phone, updated_at
         FROM hospitals WHERE id = $1`,
        [hospitalId]
      )
    ]);

    return res.json({
      hospital: hospitalResult.rows[0] || null,
      incoming: result.rows,
      hospitals: allHospitals.rows
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
