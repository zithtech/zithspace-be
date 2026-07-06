-- ============================================================================
-- Reimbursement 2.0 — policies (migration 002)
--
-- A policy bundles per-category limit overrides (lines) and a set of scope
-- assignments (which grades/departments/users it applies to). Same two-layer
-- tenant isolation as 001. All tables `rb2_`-prefixed.
-- ============================================================================

-- ─── rb2_policies (header) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rb2_policies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  name               text NOT NULL,
  code               text NOT NULL,
  description        text,
  -- Claims with a total at or below this amount skip approval (NULL/0 = off).
  auto_approve_below numeric(12, 2),
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rb2_policies_tenant_code
  ON rb2_policies (tenant_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_rb2_policies_tenant
  ON rb2_policies (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── rb2_policy_lines (per-category limit overrides) ────────────────────────
CREATE TABLE IF NOT EXISTS rb2_policy_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  policy_id     uuid NOT NULL REFERENCES rb2_policies (id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES rb2_expense_categories (id),
  max_per_claim numeric(12, 2),
  monthly_limit numeric(12, 2),
  yearly_limit  numeric(12, 2),
  per_day_limit numeric(12, 2),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rb2_policy_lines_policy
  ON rb2_policy_lines (tenant_id, policy_id);

-- ─── rb2_policy_assignments (who the policy applies to) ─────────────────────
CREATE TABLE IF NOT EXISTS rb2_policy_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  policy_id  uuid NOT NULL REFERENCES rb2_policies (id) ON DELETE CASCADE,
  scope_type text NOT NULL
               CHECK (scope_type IN ('grade', 'department', 'subdepartment',
                                      'position', 'location', 'user', 'org')),
  scope_id   uuid,   -- NULL when scope_type = 'org'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rb2_policy_assignments_policy
  ON rb2_policy_assignments (tenant_id, policy_id);

CREATE INDEX IF NOT EXISTS ix_rb2_policy_assignments_scope
  ON rb2_policy_assignments (tenant_id, scope_type, scope_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rb2_policies', 'rb2_policy_lines', 'rb2_policy_assignments']
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
