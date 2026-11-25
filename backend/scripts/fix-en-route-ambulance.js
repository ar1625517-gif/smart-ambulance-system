require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const pool = require('../db/pool');

async function fixEnRouteAmbulances() {
  try {
    const result = await pool.query(`
      UPDATE ambulances a
      SET status = 'busy', updated_at = NOW()
      FROM trips t
      WHERE t.ambulance_id = a.id
        AND t.status IN ('dispatched', 'en_route', 'arrived')
      RETURNING a.id
    `);
    console.log(`Corrected ${result.rowCount} active-trip ambulance state(s).`);
  } finally {
    await pool.end();
  }
}

fixEnRouteAmbulances().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
