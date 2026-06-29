-- ============================================================================
-- Leave 2.0 — accrual engine support (migration 004)
--
-- 1) lv2_leave_settings — per-tenant leave-year start month (1–12). Quarter /
--    half / yearly terms are computed relative to this.
--
-- 2) lv2_leave_ledger.period_key — tags each accrual credit with the period it
--    belongs to (e.g. 'monthly:2026-06', 'yearly:2026:0'). Combined with a
--    UNIQUE index this makes accrual EXACTLY-ONCE per (employee, leave type,
--    period): a retried/duplicated queue job inserts ON CONFLICT DO NOTHING.
--    This is what makes the BullMQ fan-out safe to retry.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Per-tenant leave settings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lv2_leave_settings (
  tenant_id              uuid PRIMARY KEY,
  leave_year_start_month int NOT NULL DEFAULT 1
                           CHECK (leave_year_start_month BETWEEN 1 AND 12),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ─── Ledger: period key for idempotent accrual ──────────────────────────────
ALTER TABLE lv2_leave_ledger
  ADD COLUMN IF NOT EXISTS period_key text;

-- Exactly-once accrual per employee + leave type + period.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lv2_ledger_accrual
  ON lv2_leave_ledger (tenant_id, employee_id, leave_type_id, period_key)
  WHERE entry_type = 'accrual' AND period_key IS NOT NULL;

-- ─── RLS on the new settings table ──────────────────────────────────────────
DO $$
BEGIN
  EXECUTE 'ALTER TABLE lv2_leave_settings ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE lv2_leave_settings FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON lv2_leave_settings';
  EXECUTE $f$
    CREATE POLICY tenant_isolation ON lv2_leave_settings
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  $f$;
END $$;
