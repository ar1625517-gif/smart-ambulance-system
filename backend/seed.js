require('dotenv').config();

const pool = require('./db/pool');
const { hashPassword } = require('./utils/password');
const {
  REAL_WORLD_HOSPITALS,
  REAL_WORLD_AMBULANCE_FLEET,
  syncRealWorldDataToDb
} = require('./utils/realWorldData');

async function seed() {
  console.log('Seeding real-world hospitals and ambulance driver fleet into PostgreSQL PostGIS...');

  try {
    const result = await syncRealWorldDataToDb(pool, {
      lat: 12.9756,
      lng: 77.6068,
      city: 'Bangalore'
    });

    console.log(`✓ Real-world sync successful: ${result.hospitalsCount} hospitals, ${result.ambulancesCount} ambulances active.`);
  } catch (error) {
    console.warn('Network sync encountered an issue, falling back to verified real dataset:', error.message);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [vehicleNumber, driverName, type, lng, lat] of REAL_WORLD_AMBULANCE_FLEET.map(a => [a.vehicle_number, a.driver_name, a.type, a.lng, a.lat])) {
        await client.query(
          `INSERT INTO ambulances (vehicle_number, driver_name, type, location)
           VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
           ON CONFLICT (vehicle_number) DO UPDATE
           SET location = EXCLUDED.location, status = 'available', updated_at = NOW()`,
          [vehicleNumber, driverName, type, lng, lat]
        );
      }

      for (const h of REAL_WORLD_HOSPITALS) {
        await client.query(
          `INSERT INTO hospitals
             (name, specialties, er_beds_available, icu_beds_available, location)
             VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography)
             ON CONFLICT (name) DO UPDATE
             SET location = EXCLUDED.location, updated_at = NOW()`,
          [h.name, h.specialties, h.er_beds_available, h.icu_beds_available, h.lng, h.lat]
        );
      }
      await client.query('COMMIT');
      console.log('✓ Verified real-world ambulances and hospitals loaded.');
    } catch (fallbackError) {
      await client.query('ROLLBACK');
      throw fallbackError;
    } finally {
      client.release();
    }
  }

  // Provision standard accounts for each role
  console.log('Seeding standard user accounts and role linkages...');
  const userClient = await pool.connect();
  try {
    await userClient.query('BEGIN');

    const defaultPasswordHash = hashPassword('Password123!');

    // 1. Seed or update users
    const defaultUsers = [
      { username: 'admin', displayName: 'Administrator', role: 'admin' },
      { username: 'operator1', displayName: 'Dispatch Operator 1', role: 'control_room' },
      { username: 'driver1', displayName: 'Driver Ramesh Kumar', role: 'driver' },
      { username: 'hospital1', displayName: 'St. John Trauma Desk', role: 'hospital_staff' }
    ];

    for (const u of defaultUsers) {
      await userClient.query(
        `INSERT INTO control_room_users (username, password_hash, display_name, role, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (username) DO UPDATE
         SET role = EXCLUDED.role, is_active = TRUE, updated_at = NOW()`,
        [u.username, defaultPasswordHash, u.displayName, u.role]
      );
    }

    // 2. Link driver1 to the first ambulance
    const driverRow = await userClient.query("SELECT id FROM control_room_users WHERE username = 'driver1'");
    const firstAmb = await userClient.query("SELECT id FROM ambulances ORDER BY vehicle_number LIMIT 1");
    if (driverRow.rowCount > 0 && firstAmb.rowCount > 0) {
      await userClient.query(
        "UPDATE ambulances SET driver_user_id = $1 WHERE id = $2",
        [driverRow.rows[0].id, firstAmb.rows[0].id]
      );
      console.log('✓ Linked driver1 to ambulance.');
    }

    // 3. Link hospital1 to the first hospital
    const hospUserRow = await userClient.query("SELECT id FROM control_room_users WHERE username = 'hospital1'");
    const firstHosp = await userClient.query("SELECT id FROM hospitals ORDER BY name LIMIT 1");
    if (hospUserRow.rowCount > 0 && firstHosp.rowCount > 0) {
      await userClient.query(
        "UPDATE control_room_users SET hospital_id = $1 WHERE id = $2",
        [firstHosp.rows[0].id, hospUserRow.rows[0].id]
      );
      console.log('✓ Linked hospital1 to primary hospital.');
    }

    // 4. Ensure an active emergency request and trip exist for immediate live tracking demo
    const activeTripsCount = await userClient.query(
      "SELECT COUNT(*)::INTEGER AS total FROM trips WHERE status IN ('dispatched', 'en_route', 'arrived')"
    );

    if (activeTripsCount.rows[0].total === 0 && firstAmb.rowCount > 0 && firstHosp.rowCount > 0) {
      const ambId = firstAmb.rows[0].id;
      const hospId = firstHosp.rows[0].id;

      const reqResult = await userClient.query(
        `INSERT INTO emergency_requests (
           emergency_type, location, patient_name, patient_age, patient_gender,
           contact_phone, medical_notes, conscious, breathing, vitals, status
         )
         VALUES (
           'Cardiology',
           ST_SetSRID(ST_MakePoint(77.6000, 12.9700), 4326)::geography,
           'Sunil Verma', 58, 'Male', '+91 98765 43210',
           'Patient experiencing severe chest pain. Monitored en route.',
           TRUE, TRUE,
           '{"heartRate": 112, "oxygenSaturation": 96, "systolicBp": 138}'::jsonb,
           'assigned'
         )
         RETURNING id`
      );

      const reqId = reqResult.rows[0].id;

      await userClient.query(
        `INSERT INTO trips (request_id, ambulance_id, hospital_id, status)
         VALUES ($1, $2, $3, 'en_route')`,
        [reqId, ambId, hospId]
      );

      await userClient.query("UPDATE ambulances SET status = 'busy' WHERE id = $1", [ambId]);

      console.log('✓ Seeded active incident and en-route trip for instant live telemetry demo.');
    }

    await userClient.query('COMMIT');
    console.log('✓ Database seeding and account provisioning complete.');
  } catch (userSeedError) {
    await userClient.query('ROLLBACK');
    console.error('Account seeding error:', userSeedError.message);
  } finally {
    userClient.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Database seeding failed:', error);
  process.exitCode = 1;
});
