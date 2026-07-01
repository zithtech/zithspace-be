-- ============================================================================
-- Payroll 2.0 — Payslip employee-detail field toggles (migration 017)
--
-- Adds per-field visibility switches for the employee-details block on the
-- payslip. These drive the new "Employee Details" section in Payslip & Bank
-- Settings — the company chooses which identity fields print on every payslip.
--   employee code, email, designation, department, grade, work location,
--   date of joining, and the employee bank name.
-- The name is always shown and needs no toggle. Account number reuses the
-- existing show_bank_account column.
-- ============================================================================

ALTER TABLE pay_payslip_template
  ADD COLUMN IF NOT EXISTS show_employee_code  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_email          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_designation    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_department     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_grade          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_location       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_date_of_joining boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_bank_name      boolean NOT NULL DEFAULT true;
