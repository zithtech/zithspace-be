import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    console.log('Connecting to database to create lead_activity_logs table...');
    
    // Create the table
    const query = `
      CREATE TABLE IF NOT EXISTS lead_activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        lead_id UUID NOT NULL,
        action VARCHAR(255) NOT NULL,
        performed_by UUID,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_lead_activity_logs_lead_id ON lead_activity_logs(lead_id);
      CREATE INDEX IF NOT EXISTS idx_lead_activity_logs_tenant_id ON lead_activity_logs(tenant_id);
    `;

    await pool.query(query);
    console.log('Table lead_activity_logs created successfully.');

  } catch (error) {
    console.error('Failed to create table:', error);
  } finally {
    await pool.end();
    console.log('Database connection closed.');
  }
}

run();
