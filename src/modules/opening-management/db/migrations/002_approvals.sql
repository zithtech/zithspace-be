-- ============================================================================
-- Opening Management — Phase 2: approval workflow (migration 002)
--
--   Opening Created → Hiring Manager → HR → Finance (optional) → Approved
--
-- Two layers, deliberately separate:
--   * CONFIG  — om_approval_workflows + om_approval_workflow_steps. Tenant-level
--               templates an admin maintains. Editing one must never rewrite the
--               history of an approval already in flight.
--   * RUNTIME — om_opening_approvals. When an opening is submitted, the default
--               workflow's steps are SNAPSHOTTED onto the opening: approver ids
--               are resolved once, at submission, and stored. That snapshot is
--               what gets decided on, so changing the template (or a hiring
--               manager leaving) cannot retroactively alter a live approval.
--
-- Re-submission after a rejection starts a new ROUND. Old rounds are kept, so
-- om_opening_approvals is the full audit trail of who decided what and when.
--
-- Same conventions as 001: `om_` prefix, RLS + explicit tenant_id filters, and
-- text ids for anything pointing at a Prisma-owned table. EXCEPTION: role_id is
-- `uuid`, because roles.id really is a uuid column (@db.Uuid) and this lets the
-- membership check join user_roles without a cast.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── om_approval_workflows (config header) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS om_approval_workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  is_default  boolean NOT NULL DEFAULT false,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- At most one default workflow per tenant — this is the one submission uses.
CREATE UNIQUE INDEX IF NOT EXISTS uq_om_approval_workflows_one_default
  ON om_approval_workflows (tenant_id)
  WHERE is_default AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_om_approval_workflows_tenant_name
  ON om_approval_workflows (tenant_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_om_approval_workflows_tenant
  ON om_approval_workflows (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── om_approval_workflow_steps (config detail) ─────────────────────────────
-- approver_type decides which of role_id / specific_user_id is meaningful:
--   hiring_manager   → the opening's hiring_manager_id
--   department_head  → departments.head_id for the opening's department
--   role             → anyone holding role_id (e.g. the HR or Finance role)
--   specific_user    → specific_user_id
CREATE TABLE IF NOT EXISTS om_approval_workflow_steps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  workflow_id      uuid NOT NULL REFERENCES om_approval_workflows (id) ON DELETE CASCADE,
  step_order       integer NOT NULL CHECK (step_order >= 1),
  step_name        text NOT NULL,
  approver_type    text NOT NULL
                     CHECK (approver_type IN
                       ('hiring_manager', 'department_head', 'role', 'specific_user')),
  role_id          uuid,   -- required when approver_type = 'role'
  specific_user_id text,   -- required when approver_type = 'specific_user'
  fallback_user_id text,   -- used when the primary approver cannot be resolved
  -- Finance approval is the canonical optional step: it may be skipped by an
  -- admin without blocking the chain.
  is_optional      boolean NOT NULL DEFAULT false,
  sla_hours        integer CHECK (sla_hours > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_om_workflow_steps_approver_ref CHECK (
    (approver_type = 'role'          AND role_id IS NOT NULL) OR
    (approver_type = 'specific_user' AND specific_user_id IS NOT NULL) OR
    (approver_type IN ('hiring_manager', 'department_head'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_om_workflow_steps_order
  ON om_approval_workflow_steps (workflow_id, step_order);

CREATE INDEX IF NOT EXISTS ix_om_workflow_steps_workflow
  ON om_approval_workflow_steps (tenant_id, workflow_id);

-- ─── om_opening_approvals (runtime snapshot) ────────────────────────────────
-- One row per step per round. `approver_id` is resolved at submission time and
-- frozen; for a 'role' step it stays NULL and role_id carries the requirement.
CREATE TABLE IF NOT EXISTS om_opening_approvals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  opening_id       uuid NOT NULL REFERENCES om_openings (id) ON DELETE CASCADE,
  round            integer NOT NULL DEFAULT 1 CHECK (round >= 1),
  step_order       integer NOT NULL CHECK (step_order >= 1),
  step_name        text NOT NULL,
  approver_type    text NOT NULL
                     CHECK (approver_type IN
                       ('hiring_manager', 'department_head', 'role', 'specific_user')),
  role_id          uuid,
  approver_id      text,   -- resolved user; NULL for a 'role' step
  fallback_user_id text,
  is_optional      boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'skipped', 'cancelled')),
  decided_by       text,
  decided_at       timestamptz,
  decision_note    text,
  /** True when the decision was taken via the opening.manage admin override. */
  decided_as_admin boolean NOT NULL DEFAULT false,
  -- Provenance: which template produced this row. Nullable because an opening
  -- submitted with no configured workflow gets the implicit hiring-manager step.
  workflow_id      uuid,
  workflow_step_id uuid,
  sla_hours        integer,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_om_opening_approvals_decided CHECK (
    (status = 'pending' AND decided_at IS NULL) OR status <> 'pending'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_om_opening_approvals_step
  ON om_opening_approvals (opening_id, round, step_order);

-- Drives "what is waiting on me" — the pending queue is the hot read path.
CREATE INDEX IF NOT EXISTS ix_om_opening_approvals_pending_approver
  ON om_opening_approvals (tenant_id, status, approver_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS ix_om_opening_approvals_pending_role
  ON om_opening_approvals (tenant_id, status, role_id)
  WHERE status = 'pending' AND role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_om_opening_approvals_opening
  ON om_opening_approvals (tenant_id, opening_id, round, step_order);

-- ─── om_openings: submission tracking ───────────────────────────────────────
-- approval_round is the round number currently in flight (0 = never submitted).
ALTER TABLE om_openings
  ADD COLUMN IF NOT EXISTS approval_round integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by   uuid,
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'om_approval_workflows',
    'om_approval_workflow_steps',
    'om_opening_approvals'
  ]
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
