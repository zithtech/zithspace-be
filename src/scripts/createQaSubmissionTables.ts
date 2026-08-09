import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { QA_SUBMISSION_DDL } from '../db/qaSubmissionSchema';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Provisions the QA Submission tables standalone, the same way
 * createTestCaseTables.ts / createTestScopesTable.ts do for the rest of the QA
 * workspace. The controller runs the identical statements lazily on first use,
 * so this script is optional — it exists so the schema can be applied ahead of
 * a deploy rather than on the first request.
 */
async function main() {
  const client = await pool.connect();
  try {
    console.log('Creating QA Submission tables...');
    for (const statement of QA_SUBMISSION_DDL) {
      await client.query(statement);
    }
    console.log('All QA Submission tables created successfully.');
  } catch (error) {
    console.error('Error creating QA Submission tables:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
