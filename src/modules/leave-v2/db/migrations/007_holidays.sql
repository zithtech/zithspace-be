-- ============================================================================
-- Leave 2.0 — government holidays (migration 007)
--
-- New raw-SQL table mirroring the legacy `fixed_holidays` structure (name,
-- country, state codes, date range, type, rule) plus is_active + soft delete.
-- States are an array of codes; 'ALL' means nationwide.
--
-- Migrates existing fixed_holidays rows. Legacy dates are `timestamp` holding
-- naive midnight, so ::date is the correct calendar day. Audit user ids on the
-- legacy table are text; we don't carry them over (created_by stays NULL for
-- migrated rows — new rows set it from the app).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS lv2_holidays (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  country     text NOT NULL DEFAULT 'IN',
  states      text[] NOT NULL DEFAULT '{}',  -- state codes; 'ALL' = nationwide
  from_date   date NOT NULL,
  to_date     date NOT NULL,
  type        text NOT NULL DEFAULT 'National',  -- National | State | ALL | Restricted
  rule        text NOT NULL DEFAULT 'Fixed',     -- Fixed | Variable
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS ix_lv2_holidays_tenant_date
  ON lv2_holidays (tenant_id, from_date)
  WHERE deleted_at IS NULL;

-- ─── Migrate existing fixed_holidays ────────────────────────────────────────
INSERT INTO lv2_holidays (tenant_id, name, country, states, from_date, to_date, type, rule, created_at, updated_at)
SELECT fh.tenant_id::uuid,
       fh.holiday_name,
       COALESCE(fh.country, 'IN'),
       COALESCE(fh.state, '{}'),
       fh.from_date::date,
       fh.to_date::date,
       COALESCE(fh.type, 'National'),
       COALESCE(fh.rule, 'Fixed'),
       fh.created_at,
       fh.updated_at
  FROM fixed_holidays fh
 WHERE NOT EXISTS (SELECT 1 FROM lv2_holidays);  -- guard against double-apply

-- ─── RLS ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE 'ALTER TABLE lv2_holidays ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE lv2_holidays FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON lv2_holidays';
  EXECUTE $f$
    CREATE POLICY tenant_isolation ON lv2_holidays
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  $f$;
END $$;
