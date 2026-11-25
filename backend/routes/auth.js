const express = require('express');
const pool = require('../db/pool');
const { verifyPassword, hashPassword } = require('../utils/password');
const { createToken, requireAuth, requireAdmin } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const username = typeof req.body?.username === 'string'
    ? req.body.username.trim()
    : '';
  const password = typeof req.body?.password === 'string'
    ? req.body.password
    : '';

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, password_hash, display_name, role
       FROM control_room_users
       WHERE lower(username) = lower($1) AND is_active = TRUE`,
      [username]
    );

    if (result.rowCount !== 1 || !verifyPassword(password, result.rows[0].password_hash)) {
      await writeAudit({
        action: 'login_failed',
        entityType: 'authentication',
        details: { username },
        req
      });
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const token = createToken(user);
    await writeAudit({
      action: 'login',
      entityType: 'authentication',
      entityId: user.id,
      actorId: user.id,
      actorName: user.display_name || user.username,
      details: { username: user.username, role: user.role },
      req
    });
    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role
      }
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/auth/me - return current user info
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, username, display_name, role, hospital_id, created_at
       FROM control_room_users WHERE id = $1`,
      [req.user.sub]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const user = result.rows[0];
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        hospitalId: user.hospital_id,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/auth/users - admin only: list all users
router.get('/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.is_active,
              u.hospital_id, h.name AS hospital_name,
              u.created_at, u.updated_at
       FROM control_room_users u
       LEFT JOIN hospitals h ON h.id = u.hospital_id
       ORDER BY u.created_at DESC`
    );
    return res.json({ users: result.rows });
  } catch (error) {
    return next(error);
  }
});

// POST /api/auth/users - admin only: create a new user
router.post('/users', requireAuth, requireAdmin, async (req, res, next) => {
  const { username, password, displayName, role, hospitalId } = req.body || {};
  const allowedRoles = ['admin', 'control_room', 'driver', 'hospital_staff'];

  if (typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ message: 'username is required.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'password must be at least 8 characters.' });
  }
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${allowedRoles.join(', ')}.` });
  }

  try {
    const passwordHash = hashPassword(password);
    const result = await pool.query(
      `INSERT INTO control_room_users
         (username, password_hash, display_name, role, hospital_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, display_name, role, hospital_id, created_at`,
      [
        username.trim().toLowerCase(),
        passwordHash,
        (displayName || username).trim(),
        role,
        hospitalId || null
      ]
    );
    await writeAudit({
      action: 'user_created',
      entityType: 'user',
      entityId: result.rows[0].id,
      actorId: req.user.sub,
      actorName: req.user.username,
      details: { username: result.rows[0].username, role },
      req
    });
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A user with this username already exists.' });
    }
    return next(error);
  }
});

// PATCH /api/auth/users/:id - admin only: update user role / display name / active status
router.patch('/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
  const { displayName, role, isActive, hospitalId, password } = req.body || {};
  const allowedRoles = ['admin', 'control_room', 'driver', 'hospital_staff'];
  const userId = req.params.id;

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_PATTERN.test(userId)) {
    return res.status(400).json({ message: 'userId must be a valid UUID.' });
  }
  if (role !== undefined && !allowedRoles.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${allowedRoles.join(', ')}.` });
  }

  try {
    // Build dynamic update
    const fields = [];
    const values = [];
    let idx = 1;

    if (displayName !== undefined) { fields.push(`display_name = $${idx++}`); values.push(displayName); }
    if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
    if (typeof isActive === 'boolean') { fields.push(`is_active = $${idx++}`); values.push(isActive); }
    if (hospitalId !== undefined) { fields.push(`hospital_id = $${idx++}`); values.push(hospitalId || null); }
    if (typeof password === 'string' && password.length >= 6) {
      fields.push(`password_hash = $${idx++}`);
      values.push(hashPassword(password));
    }
    fields.push(`updated_at = NOW()`);

    if (fields.length === 1) {
      return res.status(400).json({ message: 'No valid fields to update.' });
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE control_room_users SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, username, display_name, role, is_active, hospital_id, updated_at`,
      values
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    await writeAudit({
      action: 'user_updated',
      entityType: 'user',
      entityId: userId,
      actorId: req.user.sub,
      actorName: req.user.username,
      details: { fieldsUpdated: fields.map((f) => f.split(' =')[0].trim()) },
      req
    });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
