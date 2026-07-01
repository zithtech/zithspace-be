-- ============================================================================
-- Payroll 2.0 — Phase 3b: Pay Run Approvals (migration 012)
--
-- Submitting a draft run routes it through the tenant's DEFAULT approval
-- workflow (pay_approval_workflows). The run tracks current_step / total_steps;
-- every submit / approve / reject is recorded in pay_run_approvals (audit log).
--
-- Run-level approval is gated by the PAYROLL_APPROVE permission. The workflow
-- defines the number of sign-off steps + provides the audit structure; strict
-- per-step approver-identity enforcement (role/specific-user) is a follow-up.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- Extend pay_runs with workflow tracking (idempotent).
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS total_steps   integer NOT NULL DEFAULT 0;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS workflow_name text;

-- ─── pay_run_approvals (audit log) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_run_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  run_id        uuid NOT NULL REFERENCES pay_runs (id) ON DELETE CASCADE,
  step_number   integer NOT NULL DEFAULT 0,
  action        text NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected')),
  performed_by  uuid,
  remarks       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pay_run_approvals_run ON pay_run_approvals (tenant_id, run_id, created_at);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_run_approvals']
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
