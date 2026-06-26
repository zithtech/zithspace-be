import pool from '../src/config/dbpool';

/**
 * Adds the `blocks` column to `proposal_templates`.
 *
 * Templates evolved from "ordered section references" to full composed
 * builder content (the same ProposalBlock[] a proposal stores), so they can
 * be authored in the proposal builder and saved straight from a proposal.
 * `section_ids` is kept for backward-compatibility with any legacy rows.
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/add_proposal_template_blocks_column.ts
 */
async function addBlocksColumn() {
  const client = await pool.connect();
  try {
    console.log('Adding blocks column to proposal_templates...');
    await client.query(`
      ALTER TABLE proposal_templates
        ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    console.log('✅ proposal_templates.blocks column ready!');
  } catch (err) {
    console.error('❌ Error adding blocks column:', err);
  } finally {
    client.release();
    process.exit();
  }
}

addBlocksColumn();
