-- ============================================================================
-- Payroll 2.0 — Payslip Template & Bank/Disbursement Settings (migration 008)
--
-- Two single-row-per-tenant configs (like pay_settings):
--   • pay_payslip_template → payslip branding + which fields/sections to show.
--   • pay_bank_settings    → the company's disbursement account + bank-file format.
--
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_payslip_template ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_payslip_template (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL,
  -- Branding
  show_logo                 boolean NOT NULL DEFAULT true,
  accent_color              text NOT NULL DEFAULT '#3B82F6',
  footer_note               text,
  net_pay_in_words          boolean NOT NULL DEFAULT true,
  -- Statutory / identity fields
  show_pan                  boolean NOT NULL DEFAULT true,
  show_uan                  boolean NOT NULL DEFAULT true,
  show_pf_number            boolean NOT NULL DEFAULT true,
  show_esi_number           boolean NOT NULL DEFAULT true,
  show_bank_account         boolean NOT NULL DEFAULT true,
  -- Optional sections
  show_ytd                  boolean NOT NULL DEFAULT false,
  show_leave_balance        boolean NOT NULL DEFAULT true,
  show_attendance_summary   boolean NOT NULL DEFAULT false,
  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_payslip_template_tenant ON pay_payslip_template (tenant_id);

-- ─── pay_bank_settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_bank_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL,
  company_bank_name        text,
  company_account_number   text,
  company_ifsc             text,
  payment_mode             text NOT NULL DEFAULT 'neft'
                             CHECK (payment_mode IN ('neft', 'imps', 'rtgs')),
  bank_file_format         text NOT NULL DEFAULT 'generic_csv'
                             CHECK (bank_file_format IN ('generic_csv', 'hdfc', 'icici', 'sbi', 'axis', 'kotak')),
  created_by               uuid,
  updated_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_bank_settings_tenant ON pay_bank_settings (tenant_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_payslip_template', 'pay_bank_settings']
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
