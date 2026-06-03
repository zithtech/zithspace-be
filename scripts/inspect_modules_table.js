const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='modules' ORDER BY ordinal_position`);
    console.log('Existing modules columns:', cols.rows.length);
    cols.rows.forEach(x => console.log('  -', x.column_name, x.data_type));

    const cons = await pool.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'modules'::regclass`);
    console.log('Constraints:');
    cons.rows.forEach(x => console.log('  -', x.conname, '=>', x.def));

    const refs = await pool.query(`SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE confrelid = 'modules'::regclass`);
    console.log('Tables referencing modules:', refs.rows.length);
    refs.rows.forEach(x => console.log('  -', x.tbl, '/', x.conname));

    const rowcount = await pool.query(`SELECT COUNT(*)::text AS c FROM modules`);
    console.log('Row count:', rowcount.rows[0].c);
  } catch (e) {
    console.error('Inspect failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
