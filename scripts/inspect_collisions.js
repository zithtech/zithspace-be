const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const NAMES = ['sections','modules','features','plans'];
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    for (const name of NAMES) {
      const cols = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [name]
      );
      const cnt = await pool.query(`SELECT COUNT(*)::text AS c FROM ${name}`);
      const refs = await pool.query(
        `SELECT conrelid::regclass::text AS tbl FROM pg_constraint WHERE confrelid = $1::regclass`,
        [name]
      );
      console.log(`\n=== ${name} (rows=${cnt.rows[0].c}) ===`);
      cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
      if (refs.rows.length) {
        console.log(`  referenced by: ${refs.rows.map(r => r.tbl).join(', ')}`);
      } else {
        console.log(`  referenced by: (none)`);
      }
    }
  } catch (e) {
    console.error(e.message); process.exit(1);
  } finally { await pool.end(); }
})();
