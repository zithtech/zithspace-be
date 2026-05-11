const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '/Users/zithmi/z-space/zithspace-be/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync(
  '/Users/zithmi/z-space/zithspace-be/src/database/migrations/004_add_bug_config_description.sql',
  'utf8'
);
(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name IN ('bug_severity_options','bug_type_options')
        AND column_name='description'
    `);
    console.log('OK. description present on:', r.rows.map(x => x.table_name).join(', '));
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
