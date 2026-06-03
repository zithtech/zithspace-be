const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sqlPath = path.resolve(__dirname, '../src/migrations/pricing_12_subscriptions.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const TABLES = [
  'pricing_subscriptions',
  'pricing_subscription_features',
  'pricing_subscription_limits',
];

(async () => {
  try {
    await pool.query(sql);
    for (const name of TABLES) {
      const r = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [name]
      );
      console.log(`\n${name} columns:`);
      r.rows.forEach((row) => console.log(`  - ${row.column_name} (${row.data_type})`));
    }
    console.log('\nMigration applied OK.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
