const fs = require('node:fs');
const path = require('node:path');
const pool = require('./pool');

async function migrate(shouldClosePool = false) {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDirectory = path.join(__dirname, 'migrations');
    const migrations = fs.readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const migration of migrations) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [migration]
      );

      if (applied.rowCount > 0) {
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(migrationsDirectory, migration), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration]);
        await client.query('COMMIT');
        console.log(`Applied migration ${migration}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    if (shouldClosePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  migrate(true).catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { migrate };

