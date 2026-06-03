const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sqlPath = path.resolve(__dirname, '../src/migrations/pricing_02_modules.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='pricing_modules' ORDER BY ordinal_position"
    );
    console.log('pricing_modules columns:');
    r.rows.forEach((row) => console.log(`  - ${row.column_name} (${row.data_type})`));
    console.log('Migration applied OK.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
