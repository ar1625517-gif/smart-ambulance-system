const crypto = require('node:crypto');

function getAuthSecret() {
  return process.env.AUTH_SECRET || 'change-this-local-auth-secret';
}

function createToken(user) {
  const expiresAt = Math.floor(Date.now() / 1000) + (8 * 60 * 60);
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: expiresAt
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getAuthSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const expected = crypto
    .createHmac('sha256', getAuthSecret())
    .update(parts[0])
    .digest('base64url');

  if (parts[1].length !== expected.length
      || !crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  req.user = payload;
  return next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Administrator access required.' });
  }
  return next();
}

/**
 * Factory: require one of the given roles.
 * Usage: requireRole('admin', 'control_room')
 */
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access requires one of the following roles: ${roles.join(', ')}.`
      });
    }
    return next();
  };
}

const requireControlRoom = requireRole('admin', 'control_room');
const requireDriver = requireRole('admin', 'driver');
const requireHospitalStaff = requireRole('admin', 'hospital_staff', 'control_room');

module.exports = {
  createToken,
  requireAdmin,
  requireAuth,
  requireControlRoom,
  requireDriver,
  requireHospitalStaff,
  requireRole,
  verifyToken
};