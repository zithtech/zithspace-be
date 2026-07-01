-- ============================================================================
-- Payroll 2.0 — General Settings (migration 001)
--
-- Pure raw-SQL module. These tables are NOT in schema.prisma and are managed
-- exclusively by the payroll migration runner. All tables are prefixed `pay_`
-- so they never collide with the legacy Prisma-managed payroll tables (which
-- keep running in parallel until cutover).
--
-- Tenant isolation = two independent layers:
--   1. RLS policies below (FORCE'd, so even the table owner is bound by them).
--   2. Explicit `tenant_id = $1` filters in every repository query.
-- The app sets `app.current_tenant_id` per transaction via withTenant().
--
-- NOTE: tenant_id / user ids are stored as plain uuid WITHOUT foreign keys to
-- Prisma-owned tables. This keeps the module decoupled from the Prisma schema.
-- Referential integrity for those ids is enforced at the application layer.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pay_settings — one row per tenant ──────────────────────────────────────
-- Organisation-wide payroll basics every downstream calculation reads: the
-- financial year, currency, how a monthly salary is broken down to a per-day
-- rate (and the same for Loss of Pay), net-pay rounding, and the pay day.
CREATE TABLE IF NOT EXISTS pay_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL,

  -- Financial year start month (1–12). India default = April (4).
  financial_year_start_month smallint NOT NULL DEFAULT 4
                             CHECK (financial_year_start_month BETWEEN 1 AND 12),
  currency                 text NOT NULL DEFAULT 'INR',

  pay_frequency            text NOT NULL DEFAULT 'monthly'
                             CHECK (pay_frequency IN ('monthly', 'semi_monthly', 'weekly', 'biweekly')),

  -- How a monthly salary converts to a per-day rate:
  --   calendar_days  → actual days in the payroll month (28–31)
  --   fixed_days     → always `salary_fixed_days` (e.g. 30)
  --   working_days   → days excluding weekly-offs & holidays
  salary_calc_basis        text NOT NULL DEFAULT 'calendar_days'
                             CHECK (salary_calc_basis IN ('calendar_days', 'fixed_days', 'working_days')),
  salary_fixed_days        smallint NOT NULL DEFAULT 30
                             CHECK (salary_fixed_days BETWEEN 1 AND 31),

  -- Loss-of-Pay per-day basis (often, but not always, same as salary basis).
  lop_calc_basis           text NOT NULL DEFAULT 'calendar_days'
                             CHECK (lop_calc_basis IN ('calendar_days', 'fixed_days', 'working_days')),
  lop_fixed_days           smallint NOT NULL DEFAULT 30
                             CHECK (lop_fixed_days BETWEEN 1 AND 31),

  -- Net-pay rounding.
  rounding_mode            text NOT NULL DEFAULT 'nearest'
                             CHECK (rounding_mode IN ('none', 'nearest', 'up', 'down')),
  -- Round to the nearest multiple of this (e.g. 1 = whole rupee, 10 = nearest 10).
  rounding_nearest         numeric(10, 2) NOT NULL DEFAULT 1
                             CHECK (rounding_nearest > 0),
  decimal_places           smallint NOT NULL DEFAULT 2
                             CHECK (decimal_places BETWEEN 0 AND 4),

  -- Day of month salary is paid (1–31; 31 is interpreted as "last day").
  pay_day                  smallint NOT NULL DEFAULT 1
                             CHECK (pay_day BETWEEN 1 AND 31),

  -- Whether Loss of Pay is deducted for unpaid leave / absence at all.
  enable_lop               boolean NOT NULL DEFAULT true,

  created_by               uuid,
  updated_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_settings_tenant
  ON pay_settings (tenant_id);

-- ─── Row-Level Security (defense in depth; explicit tenant_id is primary) ────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_settings']
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
