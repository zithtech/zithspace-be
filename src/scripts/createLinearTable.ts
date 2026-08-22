import pool from '../config/dbpool';

async function createLinearIntegrationsTable() {
  try {
    // Check if uuid-ossp extension is enabled, if not enable it
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    
    const query = `
      CREATE TABLE IF NOT EXISTS linear_integrations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id VARCHAR(255) NOT NULL,
        user_id UUID NOT NULL,
        access_token TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, user_id)
      );
    `;
    await pool.query(query);
    console.log('Successfully created linear_integrations table');
  } catch (error) {
    console.error('Error creating linear_integrations table:', error);
  } finally {
    pool.end();
  }
}

createLinearIntegrationsTable();
