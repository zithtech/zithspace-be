-- ============================================================================
-- Reimbursement 2.0 — budgets (migration 007)
--
-- A budget caps spend for a scope over a period. Scope is the same generic
-- (scope_type, scope_id) shape used by policy assignments, plus 'category' and
-- 'project'. Spend for a budget is DERIVED (not stored) by aggregating matching
-- non-cancelled claims within [period_start, period_end] — see report/budget
-- repo. Claims carry an optional project_id / department_id cost tag so project
-- and department budgets can attribute spend without a fragile org-hierarchy join.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rb2_budgets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  name         text NOT NULL,
  scope_type   text NOT NULL
                 CHECK (scope_type IN ('org', 'department', 'project', 'category', 'user')),
  scope_id     uuid,   -- NULL only when scope_type = 'org'
  period_start date NOT NULL,
  period_end   date NOT NULL,
  amount       numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency     text NOT NULL DEFAULT 'INR',
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS ix_rb2_budgets_scope
  ON rb2_budgets (tenant_id, scope_type, scope_id)
  WHERE deleted_at IS NULL;

-- Cost-allocation tags on claims (optional). department_id lets department
-- budgets attribute spend explicitly rather than via a users.department lookup.
ALTER TABLE rb2_claims
  ADD COLUMN IF NOT EXISTS project_id    uuid,
  ADD COLUMN IF NOT EXISTS department_id uuid;

CREATE INDEX IF NOT EXISTS ix_rb2_claims_project
  ON rb2_claims (tenant_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_rb2_claims_department
  ON rb2_claims (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rb2_budgets']
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
