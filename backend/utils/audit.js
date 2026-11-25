const pool = require('../db/pool');

async function writeAudit({
  action,
  entityType,
  entityId = null,
  actorId = null,
  actorName = null,
  details = {},
  req = null
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (
         action, entity_type, entity_id, actor_id, actor_name, details, ip_address
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        action,
        entityType,
        entityId,
        actorId,
        actorName,
        JSON.stringify(details),
        req?.ip || req?.socket?.remoteAddress || null
      ]
    );
  } catch (error) {
    console.error('Could not write audit log:', error);
  }
}

module.exports = { writeAudit };
