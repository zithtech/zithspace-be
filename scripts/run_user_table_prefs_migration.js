const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'database', 'migrations', '010_create_user_table_preferences.sql'),
  'utf8'
);

(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = 'user_table_preferences'"
    );
    if (r.rows.length === 0) {
      throw new Error('user_table_preferences table was not created');
    }
    console.log('Migration applied OK — user_table_preferences ready.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
