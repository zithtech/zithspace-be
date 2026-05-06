const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '/Users/zithmi/z-space/zithspace-be/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync(
  '/Users/zithmi/z-space/zithspace-be/src/database/migrations/005_bug_sheet_status.sql',
  'utf8'
);
(async () => {
  try {
    await pool.query(sql);
    const col = await pool.query(`
      SELECT column_name, data_type, column_default
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name='bug_sheets' AND column_name='status'
    `);
    const idx = await pool.query(`
      SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND tablename='bug_sheets'
         AND indexname='bug_sheets_one_current_per_folder'
    `);
    console.log('OK. status column:', col.rows);
    console.log('OK. partial index:', idx.rows.map((x) => x.indexname).join(', ') || '(missing)');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
