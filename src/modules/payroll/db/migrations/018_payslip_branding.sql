-- ============================================================================
-- Payroll 2.0 — Payslip branding: logo + company name/address (migration 018)
--
-- Adds editable branding for the payslip header:
--   logo_url        — an uploaded company logo shown on the payslip (R2 URL).
--                     When null, the header falls back to a monogram from the
--                     company name. The show_logo flag still governs visibility.
--   company_name    — overrides the tenant name printed on the payslip header.
--                     Null = use the tenant's own name.
--   company_address — free-text address line(s) under the company name.
-- ============================================================================

ALTER TABLE pay_payslip_template
  ADD COLUMN IF NOT EXISTS logo_url        text,
  ADD COLUMN IF NOT EXISTS company_name    text,
  ADD COLUMN IF NOT EXISTS company_address text;
