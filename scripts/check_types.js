const { Pool } = require('pg');
require('dotenv').config({ path: '/Users/zithmi/z-space/zithspace-be/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name='tickets' AND column_name IN ('id','tenant_id','project_id')
    ORDER BY column_name
  `);
  console.log(r.rows);
  const u = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name='users' AND column_name='id'
  `);
  console.log('users.id:', u.rows);
  await pool.end();
})();
