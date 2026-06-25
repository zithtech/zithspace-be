-- ============================================================================
-- Leave 2.0 — leave policies (migration 002)
--
-- A policy grants leave entitlements to a set of employees. It is composed of:
--   • policy header            (lv2_leave_policies)
--   • assignments — WHO it targets, many per policy (lv2_leave_policy_assignments)
--   • lines      — WHAT it grants, many per policy (lv2_leave_policy_lines)
--
-- scope_id on assignments points at a Prisma-owned entity (grade/department/
-- subdepartment/position/user) by uuid WITHOUT a foreign key, keeping this raw
-- module decoupled from the Prisma schema (app-level integrity). 'org' scope
-- means "everyone" and stores a NULL scope_id.
--
-- Conflict resolution (used later by the allocation engine): when an employee
-- matches several policies, most-specific scope wins —
--   user > position > subdepartment > department > grade > org.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── lv2_leave_policies ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lv2_leave_policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  code        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lv2_leave_policies_tenant_code
  ON lv2_leave_policies (tenant_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_lv2_leave_policies_tenant
  ON lv2_leave_policies (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── lv2_leave_policy_assignments (WHO) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS lv2_leave_policy_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  policy_id  uuid NOT NULL REFERENCES lv2_leave_policies (id) ON DELETE CASCADE,
  scope_type text NOT NULL
               CHECK (scope_type IN ('grade', 'department', 'subdepartment', 'position', 'user', 'org')),
  scope_id   uuid,  -- NULL only for scope_type = 'org'
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope_type = 'org' OR scope_id IS NOT NULL)
);

-- One row per (policy, scope_type, scope_id); COALESCE so a single 'org' row is unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lv2_policy_assignment
  ON lv2_leave_policy_assignments
     (tenant_id, policy_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Lookup employees → matching policies during allocation.
CREATE INDEX IF NOT EXISTS ix_lv2_policy_assignment_scope
  ON lv2_leave_policy_assignments (tenant_id, scope_type, scope_id);

-- ─── lv2_leave_policy_lines (WHAT) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lv2_leave_policy_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  policy_id         uuid NOT NULL REFERENCES lv2_leave_policies (id) ON DELETE CASCADE,
  leave_type_id     uuid NOT NULL REFERENCES lv2_leave_types (id),
  allocation        numeric(8, 2) NOT NULL DEFAULT 0 CHECK (allocation >= 0),
  carry_forward     boolean NOT NULL DEFAULT false,
  -- NULL = unlimited carry-forward (when carry_forward = true)
  carry_forward_max numeric(8, 2) CHECK (carry_forward_max IS NULL OR carry_forward_max >= 0),
  period            text NOT NULL DEFAULT 'yearly' CHECK (period IN ('yearly')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lv2_policy_line
  ON lv2_leave_policy_lines (tenant_id, policy_id, leave_type_id);

CREATE INDEX IF NOT EXISTS ix_lv2_policy_line_policy
  ON lv2_leave_policy_lines (tenant_id, policy_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lv2_leave_policies', 'lv2_leave_policy_assignments', 'lv2_leave_policy_lines']
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
