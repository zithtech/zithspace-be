-- ============================================================================
-- Payroll 2.0 — Phase 2: Employee Statutory & Bank Profile (migration 010)
--
-- One profile row per employee holding the identity/statutory numbers and bank
-- account a pay run + payslip + bank-file need: PAN, UAN, PF/ESI numbers, tax
-- regime, and the salary bank account.
--
-- employee_id = platform User id (same key as pay_employee_assignments).
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
--
-- NOTE: bank_account_number is stored as-is here (tenant-isolated via RLS) and
-- masked in the UI. Encrypting at rest is a hardening follow-up.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS pay_employee_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  employee_id          uuid NOT NULL,
  -- Statutory / identity
  pan                  text,
  uan                  text,   -- PF Universal Account Number
  pf_number            text,
  esi_number           text,
  tax_regime           text NOT NULL DEFAULT 'new'
                         CHECK (tax_regime IN ('old', 'new')),
  -- Salary bank account
  account_holder_name  text,
  bank_name            text,
  bank_account_number  text,
  bank_ifsc            text,
  created_by           uuid,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_employee_profiles_emp
  ON pay_employee_profiles (tenant_id, employee_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_employee_profiles']
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
