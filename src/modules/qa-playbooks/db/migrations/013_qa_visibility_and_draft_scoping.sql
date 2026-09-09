-- QA Playbooks — Migration 013: Public/Private visibility & Draft scoping
--
-- 1. Adds visibility, status, created_by to qa_playbook_categories
-- 2. Relaxes owner_visibility constraints on qa_playbooks and qa_playbook_collections
--    so tenant-owned items can be authored as 'public' or 'workspace' (private).

-- ─── 1. Categories Table Columns ───────────────────────────────────────────
ALTER TABLE qa_playbook_categories
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- Update existing global categories (tenant_id IS NULL) to public
UPDATE qa_playbook_categories
   SET visibility = 'public'
 WHERE tenant_id IS NULL;

ALTER TABLE qa_playbook_categories DROP CONSTRAINT IF EXISTS qa_playbook_categories_visibility_chk;
ALTER TABLE qa_playbook_categories ADD CONSTRAINT qa_playbook_categories_visibility_chk
  CHECK (visibility IN ('public', 'premium', 'workspace'));

ALTER TABLE qa_playbook_categories DROP CONSTRAINT IF EXISTS qa_playbook_categories_status_chk;
ALTER TABLE qa_playbook_categories ADD CONSTRAINT qa_playbook_categories_status_chk
  CHECK (status IN ('draft', 'published', 'archived'));

-- ─── 2. Relax owner_visibility constraints ─────────────────────────────────
-- Drop restrictive constraint that prohibited tenant_id != NULL from having visibility = 'public'
ALTER TABLE qa_playbooks DROP CONSTRAINT IF EXISTS qa_playbooks_owner_visibility_chk;
ALTER TABLE qa_playbook_collections DROP CONSTRAINT IF EXISTS qa_playbook_collections_owner_visibility_chk;

CREATE INDEX IF NOT EXISTS qa_playbook_categories_visibility_idx
  ON qa_playbook_categories (visibility, status);
CREATE INDEX IF NOT EXISTS qa_playbook_categories_created_by_idx
  ON qa_playbook_categories (created_by) WHERE created_by IS NOT NULL;
