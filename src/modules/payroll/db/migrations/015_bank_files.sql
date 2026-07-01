-- ============================================================================
-- Payroll 2.0 — Phase 4b: Bank Disbursement Files (migration 015)
--
-- One bank file per run: a CSV (in the tenant's configured bank format) listing
-- each employee's beneficiary account + net pay, uploaded to R2. Only the
-- metadata + file URL live here; regenerating overwrites the run's record.
-- Generated only for FINALIZED / PAID runs.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS pay_bank_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  run_id          uuid NOT NULL REFERENCES pay_runs (id) ON DELETE CASCADE,
  month           smallint NOT NULL,
  year            smallint NOT NULL,
  period_label    text NOT NULL,
  format          text NOT NULL,
  payment_mode    text NOT NULL,
  employee_count  integer NOT NULL DEFAULT 0,
  total_amount    numeric(16, 2) NOT NULL DEFAULT 0,
  skipped_count   integer NOT NULL DEFAULT 0,
  file_url        text NOT NULL,
  file_key        text,
  generated_by    uuid,
  generated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_bank_files_run ON pay_bank_files (run_id);
CREATE INDEX IF NOT EXISTS ix_pay_bank_files_tenant ON pay_bank_files (tenant_id, year, month);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_bank_files']
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
