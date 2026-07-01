-- ============================================================================
-- Payroll 2.0 — Salary Components (migration 002)
--
-- A salary component is a reusable building block of pay: an earning (Basic,
-- HRA, Special Allowance…), a deduction (PF, Professional Tax…), a
-- reimbursement (Fuel, Telephone…) or a benefit. Salary structures (next slice)
-- compose these into a CTC; pay runs evaluate them.
--
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- Soft-deleted via deleted_at so historical structures keep resolving names.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS pay_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,

  name              text NOT NULL,
  code              text NOT NULL,

  -- What kind of line this is on the payslip.
  category          text NOT NULL DEFAULT 'earning'
                      CHECK (category IN ('earning', 'deduction', 'reimbursement', 'benefit')),

  -- How the amount is derived when applied to a structure / pay run.
  --   fixed       → a flat default_value
  --   percentage  → default_value percent of `percentage_of`
  --   formula     → reserved for a future expression engine
  calculation_type  text NOT NULL DEFAULT 'fixed'
                      CHECK (calculation_type IN ('fixed', 'percentage', 'formula')),
  -- Base for a percentage component (NULL unless calculation_type = 'percentage').
  percentage_of     text
                      CHECK (percentage_of IS NULL OR percentage_of IN ('gross', 'basic', 'ctc')),
  -- Flat amount (fixed) or the percent value (percentage). Structures may override.
  default_value     numeric(14, 2),

  -- Tax & statutory behaviour.
  is_taxable        boolean NOT NULL DEFAULT true,
  is_pro_rata       boolean NOT NULL DEFAULT true,   -- prorate on LOP / partial month
  part_of_ctc       boolean NOT NULL DEFAULT true,
  consider_for_pf   boolean NOT NULL DEFAULT false,
  consider_for_esi  boolean NOT NULL DEFAULT false,

  show_on_payslip   boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0,

  description       text,
  is_active         boolean NOT NULL DEFAULT true,

  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- Code is unique per tenant among non-deleted rows (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_components_tenant_code
  ON pay_components (tenant_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_pay_components_tenant
  ON pay_components (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_components']
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
