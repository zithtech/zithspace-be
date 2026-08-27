/**
 * Adds the project columns to qa_todo_modules — see
 * src/database/migrations/018_qa_modules_project.sql.
 *
 * Run with: node scripts/run_qa_modules_project_migration.js
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync(
  path.resolve(__dirname, '../src/database/migrations/018_qa_modules_project.sql'),
  'utf8',
);

(async () => {
  try {
    await pool.query(sql);
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'qa_todo_modules' AND column_name IN ('project_id', 'project_name')
        ORDER BY column_name`,
    );
    console.log('qa_todo_modules columns:', rows.map(r => r.column_name).join(', ') || '(none)');
    console.log('Migration applied OK.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
