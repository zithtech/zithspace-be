const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:iphaxzzzcfwppkq4@187.77.190.204:5432/zithspace_dev'
});

async function run() {
  try {
    console.log('Adding columns to leads table...');
    await pool.query(`
      ALTER TABLE leads 
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    `);
    console.log('Success: Columns added to leads table.');
    
    console.log('Creating index for performance...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_is_deleted_deleted_at ON leads (is_deleted, deleted_at);
    `);
    console.log('Success: Index created.');
    
  } catch (err) {
    console.error('Error modifying leads table:', err);
  } finally {
    await pool.end();
  }
}

run();
