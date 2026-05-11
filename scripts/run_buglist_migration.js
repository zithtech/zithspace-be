const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '/Users/zithmi/z-space/zithspace-be/.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync(
  '/Users/zithmi/z-space/zithspace-be/src/database/migrations/002_create_bug_list.sql',
  'utf8'
);

(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'bug%' ORDER BY table_name"
    );
    console.log('Tables:', r.rows.map(x => x.table_name).join(', '));
    console.log('Migration applied OK.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
