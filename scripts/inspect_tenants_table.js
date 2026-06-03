const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const cols = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='tenants' ORDER BY ordinal_position`
    );
    console.log('tenants columns:', cols.rows.length);
    cols.rows.forEach((c) => console.log(`  ${c.column_name}: ${c.data_type}`));

    const pkInfo = await pool.query(
      `SELECT a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'tenants'::regclass AND i.indisprimary`
    );
    console.log('PK:', pkInfo.rows);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
