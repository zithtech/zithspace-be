-- ============================================================================
-- Payroll 2.0 — State statutory: Professional Tax (slabs) & LWF (migration 006)
--
-- Professional Tax (PT) and Labour Welfare Fund (LWF) are levied per STATE in
-- India, each state setting its own rules:
--   • PT  → monthly slabs by gross (e.g. KA: ≤24,999 → ₹0, ≥25,000 → ₹200).
--   • LWF → small employee + employer amounts at a fixed frequency.
--
-- PT is parent (state) + child (slab rows). LWF is a flat per-state row.
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_pt_states (parent) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_pt_states (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  state       text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_pt_states_tenant_state
  ON pay_pt_states (tenant_id, lower(state)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_pay_pt_states_tenant
  ON pay_pt_states (tenant_id) WHERE deleted_at IS NULL;

-- ─── pay_pt_slabs (child) ───────────────────────────────────────────────────
-- monthly_amount is the PT levied when monthly gross falls in [from, to].
-- to_amount NULL = "and above" (open-ended top slab).
CREATE TABLE IF NOT EXISTS pay_pt_slabs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  pt_state_id    uuid NOT NULL REFERENCES pay_pt_states (id) ON DELETE CASCADE,
  from_amount    numeric(12, 2) NOT NULL DEFAULT 0 CHECK (from_amount >= 0),
  to_amount      numeric(12, 2) CHECK (to_amount IS NULL OR to_amount >= from_amount),
  monthly_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pay_pt_slabs_state
  ON pay_pt_slabs (tenant_id, pt_state_id);

-- ─── pay_lwf_states (flat per-state) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_lwf_states (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  state            text NOT NULL,
  employee_amount  numeric(12, 2) NOT NULL DEFAULT 0 CHECK (employee_amount >= 0),
  employer_amount  numeric(12, 2) NOT NULL DEFAULT 0 CHECK (employer_amount >= 0),
  frequency        text NOT NULL DEFAULT 'half_yearly'
                     CHECK (frequency IN ('monthly', 'half_yearly', 'yearly')),
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_lwf_states_tenant_state
  ON pay_lwf_states (tenant_id, lower(state)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_pay_lwf_states_tenant
  ON pay_lwf_states (tenant_id) WHERE deleted_at IS NULL;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_pt_states', 'pay_pt_slabs', 'pay_lwf_states']
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
