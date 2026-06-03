import pool from './src/config/dbpool';

async function checkTable() {
  try {
    console.log('Altering escalation table...');
    await pool.query(`
      ALTER TABLE escalation 
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE escalation 
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL;
    `);
    console.log('Table altered successfully.');

    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'escalation';
    `);
    console.log('Columns in escalation table after migration:', res.rows);
  } catch (err) {
    console.error('Error checking table:', err);
  } finally {
    await pool.end();
  }
}

checkTable();
