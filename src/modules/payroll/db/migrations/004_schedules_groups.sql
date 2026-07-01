-- ============================================================================
-- Payroll 2.0 — Pay Schedules & Pay Groups (migration 004)
--
-- A pay schedule is a payroll calendar: how often employees are paid, the
-- cycle's cut-off days, and the pay day. A pay group bundles employees onto one
-- schedule (and legal entity); employees are assigned to a group in Phase 2.
--
-- Tenant isolation = RLS (FORCE'd) + explicit `tenant_id = $1` in every query.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_schedules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_schedules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  name               text NOT NULL,
  code               text NOT NULL,
  frequency          text NOT NULL DEFAULT 'monthly'
                       CHECK (frequency IN ('monthly', 'semi_monthly', 'weekly', 'biweekly')),
  -- Day of month the pay period opens / closes (monthly: typically 1 and 31).
  cycle_start_day    smallint NOT NULL DEFAULT 1  CHECK (cycle_start_day BETWEEN 1 AND 31),
  cycle_end_day      smallint NOT NULL DEFAULT 31 CHECK (cycle_end_day BETWEEN 1 AND 31),
  -- Day salary is disbursed (31 = last day).
  pay_day            smallint NOT NULL DEFAULT 1  CHECK (pay_day BETWEEN 1 AND 31),
  -- Whether pay_day falls in the month AFTER the cycle month.
  pay_in_next_month  boolean NOT NULL DEFAULT false,
  is_default         boolean NOT NULL DEFAULT false,
  description        text,
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_schedules_tenant_code
  ON pay_schedules (tenant_id, lower(code))
  WHERE deleted_at IS NULL;

-- At most one default schedule per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_schedules_one_default
  ON pay_schedules (tenant_id)
  WHERE is_default AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_pay_schedules_tenant
  ON pay_schedules (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── pay_groups ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  name          text NOT NULL,
  code          text NOT NULL,
  schedule_id   uuid NOT NULL REFERENCES pay_schedules (id),
  legal_entity  text,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_groups_tenant_code
  ON pay_groups (tenant_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_pay_groups_tenant
  ON pay_groups (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_pay_groups_schedule
  ON pay_groups (tenant_id, schedule_id)
  WHERE deleted_at IS NULL;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_schedules', 'pay_groups']
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
