// Applies schema.sql to the database in DATABASE_URL. Idempotent (schema uses
// IF NOT EXISTS), so it's safe to re-run. Usage: npm run db:init
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — nothing to initialize. Add it to ../.env first.');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Applying schema.sql...');
  await pool.query(sql);
  console.log('Schema applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('Schema init failed:', err.message);
  process.exit(1);
});
