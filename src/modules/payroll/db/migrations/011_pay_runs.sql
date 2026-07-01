-- ============================================================================
-- Payroll 2.0 — Phase 3: Pay Runs (migration 011)
--
-- A pay run is one payroll cycle for a pay group (or all employees) in a given
-- month/year. Creating a run seeds one item per assigned employee from their
-- FROZEN salary breakdown; each item prorates by paid days (total − LOP). The
-- run walks draft → pending_approval → approved → finalized → paid.
--
-- employee_id = platform User id (same key as assignments / attendance / leaves).
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_runs (header) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  pay_group_id       uuid,                 -- NULL = all assigned employees
  pay_group_name     text NOT NULL DEFAULT 'All employees',
  month              smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  year               smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  period_label       text NOT NULL,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'pending_approval', 'approved', 'finalized', 'paid', 'cancelled')),
  total_days         smallint NOT NULL DEFAULT 30,
  employee_count     integer NOT NULL DEFAULT 0,
  total_gross        numeric(16, 2) NOT NULL DEFAULT 0,
  total_deductions   numeric(16, 2) NOT NULL DEFAULT 0,
  total_net          numeric(16, 2) NOT NULL DEFAULT 0,
  workflow_id        uuid,                 -- set at submit (Phase 3b)
  current_step       integer NOT NULL DEFAULT 0,
  notes              text,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- One run per (group-or-all, month, year). COALESCE folds NULL group → zero uuid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_runs_period
  ON pay_runs (tenant_id, year, month, COALESCE(pay_group_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS ix_pay_runs_tenant ON pay_runs (tenant_id, year, month);

-- ─── pay_run_items (per-employee register) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_run_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  run_id            uuid NOT NULL REFERENCES pay_runs (id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL,
  assignment_id     uuid,
  structure_name    text,
  monthly_ctc       numeric(14, 2) NOT NULL DEFAULT 0,
  total_days        smallint NOT NULL DEFAULT 30,
  lop_days          numeric(5, 2) NOT NULL DEFAULT 0 CHECK (lop_days >= 0),
  paid_days         numeric(5, 2) NOT NULL DEFAULT 0,
  gross             numeric(14, 2) NOT NULL DEFAULT 0,
  total_deductions  numeric(14, 2) NOT NULL DEFAULT 0,
  net               numeric(14, 2) NOT NULL DEFAULT 0,
  lop_deduction     numeric(14, 2) NOT NULL DEFAULT 0,
  -- Prorated line items: [{ componentId, code, name, category, isProRata, fullAmount, amount }]
  components        jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_run_items_emp ON pay_run_items (run_id, employee_id);
CREATE INDEX IF NOT EXISTS ix_pay_run_items_run ON pay_run_items (tenant_id, run_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_runs', 'pay_run_items']
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
