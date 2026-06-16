import pool from '../src/config/dbpool';

/**
 * Creates the `proposal_sections` table — the backend store for the
 * Section Library (reusable, composed proposal sections).
 *
 * Raw PostgreSQL (no Prisma) to match the Proposals/Leads modules.
 *
 * Run:  npx ts-node scripts/init_proposal_sections_table.ts
 */
async function createProposalSectionsTable() {
  const client = await pool.connect();
  try {
    const query = `
      -- gen_random_uuid() lives in pgcrypto
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS proposal_sections (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   VARCHAR(255) NOT NULL,
        name        VARCHAR(255) NOT NULL,
        category    VARCHAR(50)  NOT NULL DEFAULT 'Custom',
        type        VARCHAR(50)  NOT NULL DEFAULT 'text',
        description TEXT,
        -- composed UI components (phase, deliverable, callout, …)
        components  JSONB NOT NULL DEFAULT '[]'::jsonb,
        -- default content payload / metadata
        data        JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_global   BOOLEAN NOT NULL DEFAULT false,
        archived    BOOLEAN NOT NULL DEFAULT false,
        is_system   BOOLEAN NOT NULL DEFAULT false,
        created_by  VARCHAR(255),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_proposal_sections_tenant
        ON proposal_sections(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_proposal_sections_tenant_archived
        ON proposal_sections(tenant_id, archived);
    `;

    console.log('Creating proposal_sections table...');
    await client.query(query);
    console.log('✅ proposal_sections table created successfully!');
  } catch (err) {
    console.error('❌ Error creating proposal_sections table:', err);
  } finally {
    client.release();
    process.exit();
  }
}

createProposalSectionsTable();
