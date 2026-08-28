import pool from '../config/dbpool';

async function addLinearColumns() {
  try {
    await pool.query('ALTER TABLE bugs ADD COLUMN IF NOT EXISTS linear_issue_id TEXT;');
    await pool.query('ALTER TABLE bugs ADD COLUMN IF NOT EXISTS linear_issue_url TEXT;');
    console.log('Successfully added linear_issue_id and linear_issue_url to bugs table');
  } catch (error) {
    console.error('Error altering bugs table:', error);
  } finally {
    pool.end();
  }
}

addLinearColumns();
