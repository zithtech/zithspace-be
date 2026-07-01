-- ============================================================================
-- Payroll 2.0 — Salary Structures / Grades (migration 003)
--
-- A salary structure is a reusable template (a "grade") that composes salary
-- components into a CTC: each line picks a pay_components row and sets how it is
-- computed for this grade (fixed amount or a percentage of basic/gross/ctc).
-- `monthly_ctc` is a REFERENCE figure used to preview/auto-balance the template;
-- the real per-employee CTC is set when the structure is assigned (Phase 2).
--
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_structures (header) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_structures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  name          text NOT NULL,
  code          text NOT NULL,
  description   text,
  -- Reference monthly gross the template is previewed/balanced against.
  monthly_ctc   numeric(14, 2) NOT NULL DEFAULT 0 CHECK (monthly_ctc >= 0),
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_structures_tenant_code
  ON pay_structures (tenant_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_pay_structures_tenant
  ON pay_structures (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── pay_structure_components (lines) ───────────────────────────────────────
-- One row per component in a structure, with this grade's calculation rule.
CREATE TABLE IF NOT EXISTS pay_structure_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  structure_id      uuid NOT NULL REFERENCES pay_structures (id) ON DELETE CASCADE,
  component_id      uuid NOT NULL REFERENCES pay_components (id),
  calculation_type  text NOT NULL DEFAULT 'fixed'
                      CHECK (calculation_type IN ('fixed', 'percentage')),
  percentage_of     text
                      CHECK (percentage_of IS NULL OR percentage_of IN ('gross', 'basic', 'ctc')),
  value             numeric(14, 2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  display_order     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pay_structure_components_structure
  ON pay_structure_components (tenant_id, structure_id);

-- A component appears at most once per structure.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_structure_components_unique
  ON pay_structure_components (structure_id, component_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_structures', 'pay_structure_components']
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
