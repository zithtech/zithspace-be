-- QA Playbooks — Migration 012: Recycle Bin / Trash support
--
-- Adds:
-- 1. qa_playbook_categories table with immutable UUIDs
-- 2. category_id, deleted_at, deleted_by, category_deleted_at to qa_playbooks
-- 3. deleted_at, deleted_by to qa_playbook_collections
-- 4. Scopes unique slug indexes to WHERE deleted_at IS NULL

-- ─── 1. Categories Table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_playbook_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID,                                  -- NULL = global/system category
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  deleted_at  TIMESTAMPTZ,
  deleted_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_categories_global_slug_uidx
  ON qa_playbook_categories (slug) WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_categories_tenant_slug_uidx
  ON qa_playbook_categories (tenant_id, slug) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

-- Backfill distinct categories from qa_playbooks
INSERT INTO qa_playbook_categories (tenant_id, slug, name, created_at, updated_at)
SELECT DISTINCT
  p.tenant_id,
  lower(regexp_replace(trim(p.category), '[^a-zA-Z0-9]+', '-', 'g')),
  trim(p.category),
  NOW(),
  NOW()
FROM qa_playbooks p
WHERE p.category IS NOT NULL AND trim(p.category) != ''
ON CONFLICT DO NOTHING;

-- ─── 2. Playbooks Trash & Category Reference Columns ────────────────────────
ALTER TABLE qa_playbooks
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES qa_playbook_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS category_deleted_at TIMESTAMPTZ;

-- Backfill category_id link on existing playbooks
UPDATE qa_playbooks p
SET category_id = c.id
FROM qa_playbook_categories c
WHERE (p.tenant_id = c.tenant_id OR (p.tenant_id IS NULL AND c.tenant_id IS NULL))
  AND lower(trim(p.category)) = lower(trim(c.name))
  AND p.category_id IS NULL;

-- ─── 3. Collections Trash Columns ───────────────────────────────────────────
ALTER TABLE qa_playbook_collections
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ─── 4. Update Partial Unique Indexes ───────────────────────────────────────
DROP INDEX IF EXISTS qa_playbooks_global_slug_uidx;
DROP INDEX IF EXISTS qa_playbooks_tenant_slug_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbooks_global_slug_uidx
  ON qa_playbooks (slug) WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbooks_tenant_slug_uidx
  ON qa_playbooks (tenant_id, slug) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

DROP INDEX IF EXISTS qa_playbook_collections_global_slug_uidx;
DROP INDEX IF EXISTS qa_playbook_collections_tenant_slug_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_collections_global_slug_uidx
  ON qa_playbook_collections (slug) WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_collections_tenant_slug_uidx
  ON qa_playbook_collections (tenant_id, slug) WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;
