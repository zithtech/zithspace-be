-- ============================================================================
-- Payroll 2.0 — Phase 4a: Payslips (migration 014)
--
-- One payslip record per employee per run. Generated from a FINALIZED/PAID
-- run's items: a PDF is rendered (Puppeteer) and uploaded to R2; only the URL +
-- a snapshot of the totals live here (the PDF is the immutable artefact).
--
-- employee_id = platform User id (same key as the rest of the module).
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS pay_payslips (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  run_id            uuid NOT NULL REFERENCES pay_runs (id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL,
  month             smallint NOT NULL,
  year              smallint NOT NULL,
  period_label      text NOT NULL,
  gross             numeric(14, 2) NOT NULL DEFAULT 0,
  total_deductions  numeric(14, 2) NOT NULL DEFAULT 0,
  net               numeric(14, 2) NOT NULL DEFAULT 0,
  lop_days          numeric(5, 2) NOT NULL DEFAULT 0,
  file_url          text NOT NULL,
  file_key          text,
  status            text NOT NULL DEFAULT 'generated',
  generated_by      uuid,
  generated_at      timestamptz NOT NULL DEFAULT now()
);

-- One payslip per employee per run (regenerate overwrites).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_payslips_run_emp ON pay_payslips (run_id, employee_id);
-- For "my payslips" (Phase 5) and period lookups.
CREATE INDEX IF NOT EXISTS ix_pay_payslips_emp ON pay_payslips (tenant_id, employee_id, year, month);
CREATE INDEX IF NOT EXISTS ix_pay_payslips_run ON pay_payslips (tenant_id, run_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_payslips']
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
