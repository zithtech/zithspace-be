const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync(
  path.resolve(__dirname, '../src/database/migrations/013_create_sprint_reports.sql'),
  'utf8'
);

(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = 'sprint_reports'"
    );
    console.log('Tables:', r.rows.map((x) => x.table_name).join(', ') || '(none — already existed?)');
    console.log('Migration applied OK.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
