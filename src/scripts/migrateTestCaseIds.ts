import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  const isDryRun = !process.argv.includes('--execute');

  try {
    console.log("Starting Test Case ID migration script...");
    
    if (isDryRun) {
      console.log("\n⚠️  RUNNING IN DRY-RUN MODE (Preview Only) ⚠️");
      console.log("Pass the '--execute' flag to apply these changes to the database.\n");
    }

    // The CTE to calculate the new IDs
    const selectQuery = `
      WITH numbered_cases AS (
        SELECT 
          id,
          tenant_id,
          parent_test_case_id,
          test_case_id as old_id,
          ROW_NUMBER() OVER(PARTITION BY tenant_id, parent_test_case_id ORDER BY created_at ASC, id ASC) as row_num
        FROM qa_test_cases
        WHERE parent_test_case_id IS NOT NULL
      )
      SELECT id, old_id, 'TC-' || LPAD(row_num::text, 3, '0') as new_id
      FROM numbered_cases
      WHERE old_id != 'TC-' || LPAD(row_num::text, 3, '0')
      LIMIT 20;
    `;

    if (isDryRun) {
      const preview = await client.query(selectQuery);
      if (preview.rowCount === 0) {
        console.log("No test cases need to be updated. They are already in the correct format.");
      } else {
        console.log(`Preview of changes (Showing up to 20 test cases that will be updated):`);
        console.table(preview.rows);
        
        const countRes = await client.query(`
          WITH numbered_cases AS (
            SELECT test_case_id as old_id, ROW_NUMBER() OVER(PARTITION BY tenant_id, parent_test_case_id ORDER BY created_at ASC, id ASC) as row_num
            FROM qa_test_cases WHERE parent_test_case_id IS NOT NULL
          )
          SELECT COUNT(*) FROM numbered_cases WHERE old_id != 'TC-' || LPAD(row_num::text, 3, '0');
        `);
        console.log(`Total test cases that will be updated: ${countRes.rows[0].count}`);
      }
      return; // Exit early in dry-run mode
    }

    // Execute mode
    await client.query('BEGIN');

    const updateQuery = `
      WITH numbered_cases AS (
        SELECT 
          id,
          tenant_id,
          parent_test_case_id,
          ROW_NUMBER() OVER(PARTITION BY tenant_id, parent_test_case_id ORDER BY created_at ASC, id ASC) as row_num
        FROM qa_test_cases
        WHERE parent_test_case_id IS NOT NULL
      )
      UPDATE qa_test_cases tc
      SET test_case_id = 'TC-' || LPAD(nc.row_num::text, 3, '0')
      FROM numbered_cases nc
      WHERE tc.id = nc.id AND tc.test_case_id != 'TC-' || LPAD(nc.row_num::text, 3, '0');
    `;

    console.log("Running test case migration query...");
    const result = await client.query(updateQuery);
    console.log(`Successfully migrated ${result.rowCount} test cases to the new parent-specific ID format.`);

    const bugQuery = `
      UPDATE bugs b
      SET test_case_ref = tc.test_case_id
      FROM qa_test_cases tc
      WHERE b.test_case_id = tc.id::text AND b.test_case_ref != tc.test_case_id;
    `;

    console.log("Running bug list sync query...");
    const bugResult = await client.query(bugQuery);
    console.log(`Successfully synced ${bugResult.rowCount} bugs to display the updated test case numbers.`);

    await client.query('COMMIT');
    console.log("Migration completed and committed successfully.");

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error during migration. Transaction rolled back.", error);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
