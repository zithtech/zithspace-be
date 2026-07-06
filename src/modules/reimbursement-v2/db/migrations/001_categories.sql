-- ============================================================================
-- Reimbursement 2.0 — expense categories (migration 001)
--
-- Pure raw-SQL module. These tables are NOT in schema.prisma and are managed
-- exclusively by the reimbursement-v2 migration runner. All tables are prefixed
-- `rb2_` so they never collide with the legacy Prisma-managed reimbursement
-- tables (reimbursement_settings_categories, reimbursements, etc.).
--
-- Tenant isolation = two independent layers:
--   1. RLS policies below (FORCE'd, so even the table owner is bound by them).
--   2. Explicit `tenant_id = $1` filters in every repository query.
-- The app sets `app.current_tenant_id` per transaction via withTenant().
--
-- NOTE: tenant_id / user ids are stored as plain uuid WITHOUT foreign keys to
-- Prisma-owned tables (tenants, users). This keeps the module decoupled from the
-- Prisma schema. Referential integrity for those ids is enforced at the app layer.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── rb2_expense_categories ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rb2_expense_categories (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  name                   text NOT NULL,
  code                   text NOT NULL,
  description            text,
  gl_code                text,                              -- accounting / GL code
  max_per_claim          numeric(12, 2),                    -- per line-item cap
  monthly_limit          numeric(12, 2),
  yearly_limit           numeric(12, 2),
  per_day_limit          numeric(12, 2),
  receipt_required       boolean NOT NULL DEFAULT false,
  receipt_required_above numeric(12, 2),                    -- receipt only above this
  is_active              boolean NOT NULL DEFAULT true,
  created_by             uuid,
  updated_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

-- Code is unique per tenant among non-deleted rows (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rb2_categories_tenant_code
  ON rb2_expense_categories (tenant_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_rb2_categories_tenant
  ON rb2_expense_categories (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- FORCE makes the policy bind the table owner too (Prisma's role owns these),
-- so there is no implicit bypass.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rb2_expense_categories']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;
