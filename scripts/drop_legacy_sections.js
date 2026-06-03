// One-shot: drop the empty `sections` table we created before deciding on the
// `pricing_*` naming convention. Safe: 0 rows, 0 references.
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const before = await pool.query(
      `SELECT COUNT(*)::text AS c FROM information_schema.tables
       WHERE table_schema='public' AND table_name='sections'`
    );
    if (before.rows[0].c === '0') {
      console.log('No `sections` table present. Nothing to do.');
      return;
    }
    const rows = await pool.query(`SELECT COUNT(*)::text AS c FROM sections`);
    if (rows.rows[0].c !== '0') {
      console.error(`Refusing: \`sections\` has ${rows.rows[0].c} rows. Manual review required.`);
      process.exit(1);
    }
    await pool.query(`DROP TABLE sections CASCADE`);
    console.log('Dropped empty `sections` table.');
  } catch (e) {
    console.error('Drop failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
