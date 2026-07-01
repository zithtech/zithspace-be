-- ============================================================================
-- Payroll 2.0 — Phase 2: Employee Salary Assignments (migration 009)
--
-- Assigns a salary structure to an employee at a specific monthly CTC and
-- FREEZES the resulting component breakdown (a snapshot), so later edits to the
-- structure template don't retroactively change an employee's agreed pay.
-- One ACTIVE assignment per employee; reassigning deactivates the previous one.
--
-- employee_id stores the platform User id (the `value` from /api/members/select),
-- keyed the same way as leave-v2 / attendance so Phase-3 pay runs can join LOP
-- and worked-days by the same id. Stored WITHOUT a FK (app-level integrity).
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_employee_assignments (header) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_employee_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  employee_id     uuid NOT NULL,
  structure_id    uuid NOT NULL REFERENCES pay_structures (id),
  monthly_ctc     numeric(14, 2) NOT NULL DEFAULT 0 CHECK (monthly_ctc >= 0),
  annual_ctc      numeric(14, 2) NOT NULL DEFAULT 0 CHECK (annual_ctc >= 0),
  effective_from  date NOT NULL DEFAULT current_date,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- At most one active assignment per employee.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_emp_assign_active
  ON pay_employee_assignments (tenant_id, employee_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS ix_pay_emp_assign_employee
  ON pay_employee_assignments (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS ix_pay_emp_assign_structure
  ON pay_employee_assignments (tenant_id, structure_id);

-- ─── pay_employee_assignment_components (frozen breakdown snapshot) ──────────
-- Denormalised (code/name/category copied in) so the snapshot survives even if
-- the underlying pay_components row is later renamed or removed.
CREATE TABLE IF NOT EXISTS pay_employee_assignment_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  assignment_id     uuid NOT NULL REFERENCES pay_employee_assignments (id) ON DELETE CASCADE,
  component_id      uuid NOT NULL,
  code              text NOT NULL,
  name              text NOT NULL,
  category          text NOT NULL,
  calculation_type  text NOT NULL,
  percentage_of     text,
  value             numeric(14, 2) NOT NULL DEFAULT 0,
  calculated_amount numeric(14, 2) NOT NULL DEFAULT 0,
  display_order     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pay_emp_assign_comp_assignment
  ON pay_employee_assignment_components (tenant_id, assignment_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_employee_assignments', 'pay_employee_assignment_components']
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
