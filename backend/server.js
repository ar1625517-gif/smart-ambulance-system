require('dotenv').config();

const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const cors = require('cors');
const compression = require('compression');
const pool = require('./db/pool');
const { migrate } = require('./db/migrate');
const dispatchRoutes = require('./routes/dispatch');
const managementRoutes = require('./routes/management');
const authRoutes = require('./routes/auth');
const { requireAdmin, requireAuth, verifyToken } = require('./middleware/auth');
const { writeAudit } = require('./utils/audit');

const app = express();

// --- CORS configuration ---
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, mobile apps, same-origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin ${origin} not allowed`), false);
  },
  credentials: true
}));

app.use(compression({ threshold: 1024, level: 6 }));
app.use(express.json({ limit: '32kb' }));

// --- Simple in-process rate limiter ---
const rateLimitStore = new Map();
function rateLimit({ windowMs, max, keyFn }) {
  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn ? keyFn(req) : (req.ip || 'unknown');
    const now = Date.now();
    const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    rateLimitStore.set(key, entry);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));

    if (entry.count > max) {
      return res.status(429).json({
        message: 'Too many requests. Please wait before trying again.'
      });
    }
    return next();
  };
}

// Clean up rate limit store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}, 60000).unref();

// Routes
app.get('/', (req, res) => res.json({ name: 'MediRoute API', version: '1.0.0', status: 'running' }));

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT PostGIS_Full_Version()');
    res.json({ status: 'ok', database: 'connected', postgis: 'enabled' });
  } catch (error) {
    next(error);
  }
});

// Keep /health for backwards compatibility
app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT PostGIS_Full_Version()');
    res.json({ status: 'ok', database: 'connected', postgis: 'enabled' });
  } catch (error) {
    next(error);
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    credentials: true
  }
});
app.locals.io = io;

// Apply rate limits before routes
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const sosRateLimit = rateLimit({ windowMs: 60 * 1000, max: 10 });

app.use('/api/auth/login', loginRateLimit);
app.use('/api/dispatch/sos', sosRateLimit);

app.use('/api/dispatch', dispatchRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/management', requireAuth, managementRoutes);

// Admin analytics
app.get('/api/admin/analytics', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const [summary, emergencies, outcomes, ambulances, daily] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM emergency_requests)::INTEGER AS total_requests,
          (SELECT COUNT(*) FROM emergency_requests WHERE status = 'pending')::INTEGER AS pending_requests,
          (SELECT COUNT(*) FROM trips)::INTEGER AS total_trips,
          (SELECT COUNT(*) FROM trips WHERE status IN ('dispatched','en_route','arrived'))::INTEGER AS active_trips,
          (SELECT COUNT(*) FROM trips WHERE status = 'completed')::INTEGER AS completed_trips,
          (SELECT COUNT(*) FROM trips WHERE status = 'cancelled')::INTEGER AS cancelled_trips,
          (SELECT COUNT(*) FROM ambulances)::INTEGER AS total_ambulances,
          (SELECT COUNT(*) FROM ambulances WHERE status = 'available')::INTEGER AS available_ambulances,
          (SELECT COUNT(*) FROM ambulances WHERE status = 'busy')::INTEGER AS busy_ambulances,
          (SELECT COUNT(*) FROM ambulances WHERE status = 'offline')::INTEGER AS offline_ambulances,
          (SELECT COUNT(*) FROM hospitals)::INTEGER AS total_hospitals,
          COALESCE((SELECT SUM(er_beds_available) FROM hospitals), 0)::INTEGER AS er_beds_available,
          COALESCE((SELECT SUM(icu_beds_available) FROM hospitals), 0)::INTEGER AS icu_beds_available
      `),
      pool.query(`
        SELECT emergency_type, COUNT(*)::INTEGER AS count
        FROM emergency_requests
        GROUP BY emergency_type
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT status, COUNT(*)::INTEGER AS count
        FROM trips
        GROUP BY status
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT status, COUNT(*)::INTEGER AS count
        FROM ambulances
        GROUP BY status
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT to_char(created_at, 'YYYY-MM-DD') AS date,
               COUNT(*)::INTEGER AS count
        FROM emergency_requests
        WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY to_char(created_at, 'YYYY-MM-DD')
        ORDER BY date
      `)
    ]);

    return res.json({
      summary: summary.rows[0],
      emergencies: emergencies.rows,
      outcomes: outcomes.rows,
      ambulances: ambulances.rows,
      daily: daily.rows
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/audit', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const result = await pool.query(`
      SELECT id, action, entity_type, entity_id, actor_id, actor_name,
             details, ip_address, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return res.json({ logs: result.rows });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/maintenance/retention', requireAuth, requireAdmin, async (req, res, next) => {
  const requestedDays = Number(req.body?.days ?? 7);
  if (!Number.isInteger(requestedDays) || requestedDays < 7 || requestedDays > 3650) {
    return res.status(400).json({ message: 'days must be an integer between 7 and 3650.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const historyResult = await client.query(
      'DELETE FROM location_history WHERE recorded_at < NOW() - ($1 * INTERVAL \'1 day\')',
      [requestedDays]
    );
    const auditResult = await client.query(
      'DELETE FROM audit_logs WHERE created_at < NOW() - ($1 * INTERVAL \'1 day\')',
      [requestedDays]
    );
    const oldTripsResult = await client.query(
      `DELETE FROM trips
       WHERE status IN ('completed', 'cancelled')
         AND updated_at < NOW() - ($1 * INTERVAL '1 day')
       RETURNING id`,
      [requestedDays]
    );
    const requestsResult = await client.query(
      `DELETE FROM emergency_requests
       WHERE status IN ('completed', 'cancelled')
         AND created_at < NOW() - ($1 * INTERVAL '1 day')
       RETURNING id`,
      [requestedDays]
    );

    await client.query('COMMIT');
    await writeAudit({
      action: 'retention_cleanup',
      entityType: 'database',
      details: {
        days: requestedDays,
        locationHistoryDeleted: historyResult.rowCount,
        auditLogsDeleted: auditResult.rowCount,
        tripsDeleted: oldTripsResult.rowCount,
        requestsDeleted: requestsResult.rowCount
      },
      actorId: req.user?.sub,
      actorName: req.user?.username,
      req
    });

    return res.json({
      days: requestedDays,
      deleted: {
        locationHistory: historyResult.rowCount,
        auditLogs: auditResult.rowCount,
        trips: oldTripsResult.rowCount,
        requests: requestsResult.rowCount
      }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
});

// Reports
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

app.get('/api/admin/reports/backup.json', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const [ambulances, hospitals, requests, trips, audit] = await Promise.all([
      pool.query(`
        SELECT id, vehicle_number, driver_name, type, status, updated_at,
               ST_Y(location::geometry) AS latitude,
               ST_X(location::geometry) AS longitude
        FROM ambulances ORDER BY vehicle_number
      `),
      pool.query(`
        SELECT id, name, specialties, er_beds_available, icu_beds_available, updated_at,
               ST_Y(location::geometry) AS latitude,
               ST_X(location::geometry) AS longitude
        FROM hospitals ORDER BY name
      `),
      pool.query(`
        SELECT id, emergency_type, status, patient_name, patient_age, patient_gender,
               contact_phone, medical_notes, conscious, breathing, vitals, created_at,
               ST_Y(location::geometry) AS latitude,
               ST_X(location::geometry) AS longitude
        FROM emergency_requests ORDER BY created_at DESC
      `),
      pool.query(`
        SELECT id, request_id, ambulance_id, hospital_id, status, created_at, updated_at
        FROM trips ORDER BY created_at DESC
      `),
      pool.query(`
        SELECT id, action, entity_type, entity_id, actor_id, actor_name,
               details, ip_address, created_at
        FROM audit_logs ORDER BY created_at DESC LIMIT 5000
      `)
    ]);

    await writeAudit({
      action: 'backup_exported',
      entityType: 'database',
      details: {
        ambulances: ambulances.rowCount,
        hospitals: hospitals.rowCount,
        requests: requests.rowCount,
        trips: trips.rowCount,
        auditLogs: audit.rowCount
      },
      actorId: req.user?.sub,
      actorName: req.user?.username,
      req
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mediroute-backup.json"');
    return res.send(JSON.stringify({
      exportedAt: new Date().toISOString(),
      ambulances: ambulances.rows,
      hospitals: hospitals.rows,
      emergencyRequests: requests.rows,
      trips: trips.rows,
      auditLogs: audit.rows
    }, null, 2));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/reports/audit.csv', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, action, entity_type, entity_id, actor_id, actor_name,
             details, ip_address, created_at
      FROM audit_logs ORDER BY created_at DESC LIMIT 5000
    `);
    const columns = ['id', 'action', 'entity_type', 'entity_id', 'actor_id', 'actor_name', 'details', 'ip_address', 'created_at'];
    const csv = [
      columns.join(','),
      ...result.rows.map((row) => columns.map((col) => {
        const value = col === 'details' ? JSON.stringify(row[col] || {}) : row[col];
        return csvEscape(value);
      }).join(','))
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mediroute-audit.csv"');
    await writeAudit({ action: 'report_downloaded', entityType: 'report', details: { reportType: 'audit', format: 'csv' }, actorId: req.user?.sub, actorName: req.user?.username, req });
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/reports/incidents.csv', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT r.id AS request_id, r.emergency_type, r.status AS request_status,
             r.created_at, t.id AS trip_id, t.status AS trip_status,
             t.updated_at AS trip_updated_at,
             a.vehicle_number, a.driver_name,
             h.name AS hospital_name, h.er_beds_available
      FROM emergency_requests r
      LEFT JOIN trips t ON t.request_id = r.id
      LEFT JOIN ambulances a ON a.id = t.ambulance_id
      LEFT JOIN hospitals h ON h.id = t.hospital_id
      ORDER BY r.created_at DESC
    `);
    const columns = ['request_id', 'emergency_type', 'request_status', 'created_at', 'trip_id', 'trip_status', 'trip_updated_at', 'vehicle_number', 'driver_name', 'hospital_name', 'er_beds_available'];
    const csv = [columns.join(','), ...result.rows.map((row) => columns.map((col) => csvEscape(row[col])).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mediroute-incidents.csv"');
    await writeAudit({ action: 'report_downloaded', entityType: 'report', details: { reportType: 'incidents', format: 'csv' }, actorId: req.user?.sub, actorName: req.user?.username, req });
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/reports/resources.csv', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const [ambulances, hospitals] = await Promise.all([
      pool.query(`SELECT vehicle_number, driver_name, type, status, updated_at, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude FROM ambulances ORDER BY vehicle_number`),
      pool.query(`SELECT name, specialties, er_beds_available, icu_beds_available, updated_at, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude FROM hospitals ORDER BY name`)
    ]);
    const aColumns = ['vehicle_number', 'driver_name', 'type', 'status', 'updated_at', 'latitude', 'longitude'];
    const hColumns = ['name', 'specialties', 'er_beds_available', 'icu_beds_available', 'updated_at', 'latitude', 'longitude'];
    const sections = [
      'AMBULANCES', aColumns.join(','),
      ...ambulances.rows.map((row) => aColumns.map((col) => csvEscape(row[col])).join(',')),
      '', 'HOSPITALS', hColumns.join(','),
      ...hospitals.rows.map((row) => hColumns.map((col) => {
        const value = col === 'specialties' ? row[col]?.join(' | ') : row[col];
        return csvEscape(value);
      }).join(','))
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mediroute-resources.csv"');
    await writeAudit({ action: 'report_downloaded', entityType: 'report', details: { reportType: 'resources', format: 'csv' }, actorId: req.user?.sub, actorName: req.user?.username, req });
    return res.send(`\uFEFF${sections.join('\r\n')}`);
  } catch (error) {
    return next(error);
  }
});

// --- Socket.IO ---
io.on('connection', (socket) => {
  /**
   * Authenticate a socket from a Bearer token stored in the handshake auth.
   * Returns the decoded payload or null.
   */
  function getSocketUser() {
    const token = socket.handshake?.auth?.token;
    return token ? verifyToken(token) : null;
  }

  socket.on('join_control_room', () => {
    const user = getSocketUser();
    if (!user || !['admin', 'control_room', 'driver', 'hospital_staff'].includes(user.role)) {
      socket.emit('auth_error', { message: 'Authentication required to join control room.' });
      return;
    }
    socket.join('control_room');
  });

  socket.on('join_trip', (tripId) => {
    const user = getSocketUser();
    if (!user) {
      socket.emit('auth_error', { message: 'Authentication required to track a trip.' });
      return;
    }
    if (typeof tripId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tripId)) {
      socket.join(tripId);
    }
  });

  socket.on('driver_location_update', async (payload) => {
    const user = getSocketUser();
    if (!user || !['admin', 'driver', 'control_room'].includes(user.role)) {
      socket.emit('auth_error', { message: 'Authentication required to send GPS updates.' });
      return;
    }

    if (!payload || typeof payload.tripId !== 'string'
        || !Number.isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90
        || !Number.isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180) {
      return;
    }

    let client;
    try {
      client = await pool.connect();
      const tripResult = await client.query(
        `SELECT ambulance_id FROM trips WHERE id = $1 AND status = 'en_route'`,
        [payload.tripId],
      );
      if (tripResult.rowCount !== 1) return;

      const ambulanceId = tripResult.rows[0].ambulance_id;
      await client.query('BEGIN');
      await client.query(
        `UPDATE ambulances
         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             updated_at = NOW()
         WHERE id = $3`,
        [payload.lng, payload.lat, ambulanceId],
      );
      await client.query(
        `INSERT INTO location_history (trip_id, ambulance_id, location)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)`,
        [payload.tripId, ambulanceId, payload.lng, payload.lat],
      );
      await client.query('COMMIT');

      io.to(payload.tripId).emit('live_location', {
        tripId: payload.tripId,
        lat: payload.lat,
        lng: payload.lng,
        recordedAt: new Date().toISOString(),
        etaMinutes: Number.isFinite(payload.etaMinutes) && payload.etaMinutes >= 0
          ? payload.etaMinutes
          : null,
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Could not persist live ambulance location:', error);
    } finally {
      if (client) client.release();
    }
  });

  socket.on('ambulance_driver_gps', async (payload) => {
    const user = getSocketUser();
    if (!user || !['admin', 'driver', 'control_room'].includes(user.role)) {
      socket.emit('auth_error', { message: 'Authentication required to broadcast GPS.' });
      return;
    }

    if (!payload || typeof payload.ambulanceId !== 'string'
        || !Number.isFinite(payload.lat) || payload.lat < -90 || payload.lat > 90
        || !Number.isFinite(payload.lng) || payload.lng < -180 || payload.lng > 180) {
      return;
    }

    try {
      await pool.query(
        `UPDATE ambulances
         SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             updated_at = NOW()
         WHERE id = $3`,
        [payload.lng, payload.lat, payload.ambulanceId]
      );
      io.to('control_room').emit('ambulance_location_updated', {
        ambulanceId: payload.ambulanceId,
        lat: payload.lat,
        lng: payload.lng,
        recordedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Could not update standby ambulance location:', err.message);
    }
  });

  socket.on('send_vitals', (payload) => {
    const user = getSocketUser();
    if (!user) return; // Silently ignore unauthenticated vitals

    if (payload && typeof payload.tripId === 'string'
        && payload.vitals && typeof payload.vitals === 'object'
        && !Array.isArray(payload.vitals)) {
      io.to(payload.tripId).emit('er_vitals_alert', payload.vitals);
    }
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must contain valid JSON.' });
  }
  if (error.message?.startsWith('CORS:')) {
    return res.status(403).json({ message: error.message });
  }
  res.status(500).json({ message: 'Internal server error.' });
});

const port = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    await pool.query('SELECT PostGIS_Full_Version()');
    await migrate(false);
    server.listen(port, () => {
      console.log(`MediRoute API running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Could not connect to PostgreSQL/PostGIS:', error);
    await pool.end();
    process.exitCode = 1;
  }
}

async function shutdown() {
  server.close(async () => {
    await pool.end();
  });
}

startServer();
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
