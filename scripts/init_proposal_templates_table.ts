import pool from '../src/config/dbpool';

/**
 * Creates the `proposal_templates` table — the backend store for the
 * Template Library (reusable blueprints that compose ordered sections
 * with a theme + font preset).
 *
 * Raw PostgreSQL (no Prisma) to match the Proposals/Sections modules.
 *
 * Run:  npx ts-node scripts/init_proposal_templates_table.ts
 */
async function createProposalTemplatesTable() {
  const client = await pool.connect();
  try {
    const query = `
      -- gen_random_uuid() lives in pgcrypto
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS proposal_templates (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    VARCHAR(255) NOT NULL,
        name         VARCHAR(255) NOT NULL,
        description  TEXT,
        -- full composed builder content (ProposalBlock[]: cover/sections/components)
        blocks       JSONB NOT NULL DEFAULT '[]'::jsonb,
        -- legacy: ordered list of proposal_sections ids (kept for back-compat)
        section_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
        -- theme + font preset ids (see themePresets.ts on the frontend)
        theme_id     VARCHAR(64) NOT NULL DEFAULT 'azure',
        font_id      VARCHAR(64) NOT NULL DEFAULT 'inter',
        archived     BOOLEAN NOT NULL DEFAULT false,
        is_system    BOOLEAN NOT NULL DEFAULT false,
        created_by   VARCHAR(255),
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_proposal_templates_tenant
        ON proposal_templates(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_proposal_templates_tenant_archived
        ON proposal_templates(tenant_id, archived);
    `;

    console.log('Creating proposal_templates table...');
    await client.query(query);
    console.log('✅ proposal_templates table created successfully!');
  } catch (err) {
    console.error('❌ Error creating proposal_templates table:', err);
  } finally {
    client.release();
    process.exit();
  }
}

createProposalTemplatesTable();
