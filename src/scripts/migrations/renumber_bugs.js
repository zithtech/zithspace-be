const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Started transaction...');

    // 1. We will assign new bug numbers using ROW_NUMBER grouped by project_id
    // This creates a temporary view mapping the bug ID to its new bug_number.
    const query = `
      WITH RankedBugs AS (
        SELECT 
          b.id AS bug_id,
          f.project_id,
          ROW_NUMBER() OVER (
            PARTITION BY f.project_id 
            ORDER BY b.created_at ASC
          ) as seq_num
        FROM bugs b
        JOIN bug_folders f ON b.folder_id = f.id
      ),
      NewNumbers AS (
        SELECT 
          bug_id,
          'BUG-' || LPAD(seq_num::text, 4, '0') AS new_bug_number
        FROM RankedBugs
      )
      UPDATE bugs b
      SET bug_number = n.new_bug_number
      FROM NewNumbers n
      WHERE b.id = n.bug_id
        AND b.bug_number IS DISTINCT FROM n.new_bug_number
      RETURNING b.id, b.bug_number;
    `;

    const res = await client.query(query);
    console.log(`Updated ${res.rowCount} bugs with new project-scoped sequences.`);

    // 2. We also need to update the qa_submission_known_issues table which copies the bug_number string
    const qaUpdate = `
      UPDATE qa_submission_known_issues qsb
      SET bug_number = b.bug_number
      FROM bugs b
      WHERE qsb.bug_id = b.id
        AND qsb.bug_number IS DISTINCT FROM b.bug_number
    `;
    const qaRes = await client.query(qaUpdate);
    console.log(`Updated ${qaRes.rowCount} redundant bug_number references in qa_submission_bugs.`);

    await client.query('COMMIT');
    console.log('Migration successful. Committed transaction.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed. Rolled back transaction:', error);
  } finally {
    client.release();
    pool.end();
  }
}

main();
