-- Remove old (Prisma) payroll module tables. Payroll 2.0 (pay_*) is unaffected.
-- NOTE: employee_payroll_details is intentionally KEPT (used by onboarding).
DROP TABLE IF EXISTS "payslip_records" CASCADE;
DROP TABLE IF EXISTS "salary_approval_logs" CASCADE;
DROP TABLE IF EXISTS "salary_approval_steps" CASCADE;
DROP TABLE IF EXISTS "salary_approval_workflows" CASCADE;
DROP TABLE IF EXISTS "salary_adjustments" CASCADE;
DROP TABLE IF EXISTS "employee_salary_assignment_components" CASCADE;
DROP TABLE IF EXISTS "employee_salary_assignments" CASCADE;
DROP TABLE IF EXISTS "salary_structure_components" CASCADE;
DROP TABLE IF EXISTS "salary_structures" CASCADE;
DROP TABLE IF EXISTS "bank_disbursement_files" CASCADE;
DROP TABLE IF EXISTS "salary_payouts" CASCADE;
DROP TABLE IF EXISTS "salary_components" CASCADE;
