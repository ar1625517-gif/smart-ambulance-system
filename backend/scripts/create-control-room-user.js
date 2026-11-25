require('dotenv').config();

const pool = require('../db/pool');
const { hashPassword } = require('../utils/password');

async function createControlRoomUser() {
  const [username, password, displayName = 'Control Room', role = 'control_room'] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: node scripts/create-control-room-user.js <username> <password> [displayName] [role]');
    process.exitCode = 1;
    return;
  }
  if (!['control_room', 'admin'].includes(role)) {
    console.error('role must be control_room or admin.');
    process.exitCode = 1;
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO control_room_users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           display_name = EXCLUDED.display_name,
           role = EXCLUDED.role,
           updated_at = NOW()
       RETURNING id, username, display_name, role`,
      [username.trim(), hashPassword(password), displayName.trim(), role]
    );
    console.log(`Control-room user ready: ${result.rows[0].username}`);
  } catch (error) {
    console.error('Could not create control-room user:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createControlRoomUser();