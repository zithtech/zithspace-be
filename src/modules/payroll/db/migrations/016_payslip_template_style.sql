-- ============================================================================
-- Payroll 2.0 — Payslip template style (migration 016)
--
-- Adds a selectable payslip design to the payslip template config. Three styles
-- are supported; the company picks one in Payslip & Bank Settings and all
-- generated payslips use it.
--   modern  — summary cards + net-pay highlight + YTD columns
--   classic — stacked earnings/deductions/reimbursements sections + YTD
--   minimal — compact single-column design
-- ============================================================================

ALTER TABLE pay_payslip_template
  ADD COLUMN IF NOT EXISTS template_style text NOT NULL DEFAULT 'modern'
    CHECK (template_style IN ('modern', 'classic', 'minimal'));
