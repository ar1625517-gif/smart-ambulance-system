require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const pool = require('../db/pool');

async function applyAuthenticationMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM schema_migrations WHERE version = $1',
      ['003_authentication.sql']
    );
    await client.query(
      fs.readFileSync(
        path.join(__dirname, '..', 'db', 'migrations', '003_authentication.sql'),
        'utf8'
      )
    );
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1)',
      ['003_authentication.sql']
    );
    await client.query('COMMIT');
    console.log('Authentication migration applied.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyAuthenticationMigration().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
