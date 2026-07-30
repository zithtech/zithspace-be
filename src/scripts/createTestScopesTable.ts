import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("Creating qa_test_scopes table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_test_scopes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        priority VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Draft',
        qa_owner VARCHAR(100),
        start_date DATE,
        end_date DATE,
        details JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("Table created successfully.");
  } catch (error) {
    console.error("Error creating table:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
