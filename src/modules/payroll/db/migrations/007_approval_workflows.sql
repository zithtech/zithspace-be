-- ============================================================================
-- Payroll 2.0 — Salary Approval Workflows (migration 007)
--
-- A multi-step approval chain for payroll. Each workflow has ordered steps; each
-- step's approver is the employee's reporting MANAGER, anyone holding a ROLE, or
-- a SPECIFIC_USER, with an optional fallback approver. The pay run (Phase 3)
-- walks the default workflow's steps.
--
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_approval_workflows (parent) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_approval_workflows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  name         text NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  is_default   boolean NOT NULL DEFAULT false,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

-- At most one default workflow per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_approval_workflows_one_default
  ON pay_approval_workflows (tenant_id)
  WHERE is_default AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_pay_approval_workflows_tenant
  ON pay_approval_workflows (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── pay_approval_steps (child) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_approval_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  workflow_id       uuid NOT NULL REFERENCES pay_approval_workflows (id) ON DELETE CASCADE,
  step_order        integer NOT NULL CHECK (step_order >= 1),
  approver_type     text NOT NULL
                      CHECK (approver_type IN ('manager', 'role', 'specific_user')),
  role_id           uuid,   -- required when approver_type = 'role'
  specific_user_id  uuid,   -- required when approver_type = 'specific_user'
  fallback_user_id  uuid,   -- optional fallback approver
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_approval_steps_order
  ON pay_approval_steps (workflow_id, step_order);

CREATE INDEX IF NOT EXISTS ix_pay_approval_steps_workflow
  ON pay_approval_steps (tenant_id, workflow_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_approval_workflows', 'pay_approval_steps']
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
