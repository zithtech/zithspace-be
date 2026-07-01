-- ============================================================================
-- Payroll 2.0 — Statutory: Provident Fund (EPF) & ESI (migration 005)
--
-- India statutory contribution config, one row per tenant each (like
-- pay_settings). Pay runs read these to compute PF/ESI employee & employer
-- contributions. Defaults match the prevailing statutory rates/ceilings.
--
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_pf_config — Provident Fund (EPF/EPS/EDLI) ──────────────────────────
CREATE TABLE IF NOT EXISTS pay_pf_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL,
  enabled                  boolean NOT NULL DEFAULT true,
  -- Employee & employer contribution rates (% of PF wages).
  employee_rate            numeric(5, 2) NOT NULL DEFAULT 12   CHECK (employee_rate >= 0 AND employee_rate <= 100),
  employer_rate            numeric(5, 2) NOT NULL DEFAULT 12   CHECK (employer_rate >= 0 AND employer_rate <= 100),
  -- Statutory wage ceiling (₹15,000) and whether PF wages are capped at it.
  wage_ceiling             numeric(12, 2) NOT NULL DEFAULT 15000 CHECK (wage_ceiling >= 0),
  restrict_to_ceiling      boolean NOT NULL DEFAULT true,
  -- Whether the employer contribution counts toward CTC.
  include_employer_in_ctc  boolean NOT NULL DEFAULT true,
  -- Employee Pension Scheme: 8.33% of employer share diverts to EPS.
  eps_enabled              boolean NOT NULL DEFAULT true,
  eps_rate                 numeric(5, 2) NOT NULL DEFAULT 8.33 CHECK (eps_rate >= 0 AND eps_rate <= 100),
  -- EDLI (insurance) and EPF admin charges (employer-borne, % of PF wages).
  edli_enabled             boolean NOT NULL DEFAULT true,
  edli_rate                numeric(5, 2) NOT NULL DEFAULT 0.5  CHECK (edli_rate >= 0 AND edli_rate <= 100),
  admin_charges_rate       numeric(5, 2) NOT NULL DEFAULT 0.5  CHECK (admin_charges_rate >= 0 AND admin_charges_rate <= 100),
  -- Establishment / LIN code (optional).
  establishment_code       text,
  created_by               uuid,
  updated_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_pf_config_tenant ON pay_pf_config (tenant_id);

-- ─── pay_esi_config — Employee State Insurance ──────────────────────────────
CREATE TABLE IF NOT EXISTS pay_esi_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  enabled             boolean NOT NULL DEFAULT true,
  -- Employee 0.75% / employer 3.25% of gross wages.
  employee_rate       numeric(5, 2) NOT NULL DEFAULT 0.75 CHECK (employee_rate >= 0 AND employee_rate <= 100),
  employer_rate       numeric(5, 2) NOT NULL DEFAULT 3.25 CHECK (employer_rate >= 0 AND employer_rate <= 100),
  -- ESI applies when monthly gross is at/under this threshold (₹21,000).
  wage_threshold      numeric(12, 2) NOT NULL DEFAULT 21000 CHECK (wage_threshold >= 0),
  establishment_code  text,
  created_by          uuid,
  updated_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_esi_config_tenant ON pay_esi_config (tenant_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_pf_config', 'pay_esi_config']
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
