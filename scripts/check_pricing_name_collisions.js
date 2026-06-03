const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const NAMES = [
  'sections','modules','pages','features','limits_catalog',
  'plans','plan_variants','plan_variant_prices','plan_features','plan_limits',
  'addons','subscriptions','subscription_features','subscription_limits',
  'tenant_addons','tenant_feature_overrides','tenant_limit_overrides'
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [NAMES]
    );
    const existing = new Set(r.rows.map(x => x.table_name));
    console.log('Collisions (table already exists in DB):');
    NAMES.forEach(n => console.log(`  ${existing.has(n) ? '⚠ ' : '  '} ${n}`));
  } catch (e) {
    console.error(e.message); process.exit(1);
  } finally { await pool.end(); }
})();
