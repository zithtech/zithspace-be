-- ============================================================================
-- Hotspot — tenant-defined circulation categories (migration 002)
--
-- Migration 001 pinned `category` to six built-in values with a CHECK
-- constraint. Tenants need their own labels too ("Town hall", "Security",
-- "Client win"), so the vocabulary moves from the database to the application:
--
--   * the CHECK is dropped — a constraint cannot know about a catalog table
--   * `hs_circulation_categories` holds the tenant's OWN categories
--   * the six built-ins stay in code, own no rows here, and cannot be deleted
--
-- The service now validates `category` against (built-ins ∪ this table) before
-- any write, so the column is still closed — just closed at a layer that can
-- see the tenant. Dropping the CHECK does NOT loosen what can be stored.
--
-- Existing rows are unaffected: every value they hold is a built-in key.
-- ============================================================================

-- ─── hs_circulation_categories ──────────────────────────────────────────────
-- `key` is the slug stored on posts; `label` is what the UI shows. Keeping them
-- apart means renaming a category never has to rewrite the posts using it.
CREATE TABLE IF NOT EXISTS hs_circulation_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,

  key         text NOT NULL,
  label       text NOT NULL,

  created_by  text NOT NULL,   -- users.id
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One category per slug per tenant. Case-insensitive, so "Town Hall" cannot be
-- added twice as "town hall".
CREATE UNIQUE INDEX IF NOT EXISTS ux_hs_circulation_categories_key
  ON hs_circulation_categories (tenant_id, lower(key));

CREATE UNIQUE INDEX IF NOT EXISTS ux_hs_circulation_categories_label
  ON hs_circulation_categories (tenant_id, lower(label));

-- ─── Open up hs_circulation_posts.category ──────────────────────────────────
-- Postgres names an inline column CHECK `<table>_<column>_check`. IF EXISTS
-- keeps this migration safe on a database where 001 predates the constraint.
ALTER TABLE hs_circulation_posts
  DROP CONSTRAINT IF EXISTS hs_circulation_posts_category_check;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
ALTER TABLE hs_circulation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_circulation_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON hs_circulation_categories;
CREATE POLICY tenant_isolation ON hs_circulation_categories
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
