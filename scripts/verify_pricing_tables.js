const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const NAMES = ['pricing_sections', 'pricing_modules'];
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    for (const name of NAMES) {
      const cols = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [name]
      );
      console.log(`\n=== ${name} (${cols.rows.length} cols) ===`);
      cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
    }
  } catch (e) {
    console.error(e.message); process.exit(1);
  } finally { await pool.end(); }
})();
