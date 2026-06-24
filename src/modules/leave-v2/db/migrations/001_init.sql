-- ============================================================================
-- Leave 2.0 — initial schema (migration 001)
--
-- Pure raw-SQL module. These tables are NOT in schema.prisma and are managed
-- exclusively by the leave-v2 migration runner. All tables are prefixed `lv2_`
-- so they never collide with the legacy Prisma-managed leave tables.
--
-- Tenant isolation = two independent layers:
--   1. RLS policies below (FORCE'd, so even the table owner is bound by them).
--   2. Explicit `tenant_id = $1` filters in every repository query.
-- The app sets `app.current_tenant_id` per transaction via withTenant().
--
-- NOTE: tenant_id / employee_id / user ids are stored as plain uuid WITHOUT
-- foreign keys to Prisma-owned tables (tenants, employees, users). This keeps
-- the module decoupled from the Prisma schema as intended. Referential
-- integrity for those ids is enforced at the application layer.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- Reusable predicate: the current tenant from the transaction-local GUC.
-- current_setting(..., true) returns NULL (not an error) when unset → 0 rows.

-- ─── lv2_leave_types ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lv2_leave_types (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  name              text NOT NULL,
  code              text NOT NULL,
  unit              text NOT NULL DEFAULT 'day'
                      CHECK (unit IN ('day', 'hour')),
  is_paid           boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT true,
  color             text,
  description       text,
  is_active         boolean NOT NULL DEFAULT true,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- Code is unique per tenant among non-deleted rows (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lv2_leave_types_tenant_code
  ON lv2_leave_types (tenant_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_lv2_leave_types_tenant
  ON lv2_leave_types (tenant_id)
  WHERE deleted_at IS NULL;

-- ─── lv2_leave_requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lv2_leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  employee_id   uuid NOT NULL,
  leave_type_id uuid NOT NULL REFERENCES lv2_leave_types (id),
  from_date     date NOT NULL,
  to_date       date NOT NULL,
  day_portion   text NOT NULL DEFAULT 'full'
                  CHECK (day_portion IN ('full', 'first_half', 'second_half')),
  total_units   numeric(6, 2) NOT NULL CHECK (total_units > 0),
  reason        text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id   uuid,
  decided_at    timestamptz,
  decision_note text,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS ix_lv2_leave_requests_emp_status
  ON lv2_leave_requests (tenant_id, employee_id, status);

CREATE INDEX IF NOT EXISTS ix_lv2_leave_requests_type
  ON lv2_leave_requests (tenant_id, leave_type_id);

CREATE INDEX IF NOT EXISTS ix_lv2_leave_requests_dates
  ON lv2_leave_requests (tenant_id, employee_id, from_date, to_date);

-- ─── lv2_leave_ledger (append-only — the source of truth for balances) ──────
-- Every credit/debit is an immutable row. Balance = SUM(units). Never UPDATE
-- or DELETE rows here; corrections are new compensating entries.
CREATE TABLE IF NOT EXISTS lv2_leave_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  employee_id   uuid NOT NULL,
  leave_type_id uuid NOT NULL REFERENCES lv2_leave_types (id),
  entry_type    text NOT NULL
                  CHECK (entry_type IN ('opening', 'accrual', 'debit', 'credit', 'adjustment', 'encashment')),
  -- Positive = added to balance, negative = consumed. Sign convention lives here.
  units         numeric(8, 2) NOT NULL,
  balance_after numeric(10, 2),
  source        text,        -- e.g. 'leave_request'
  source_id     uuid,        -- e.g. the request id that produced this entry
  note          text,
  effective_date date NOT NULL DEFAULT current_date,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_lv2_leave_ledger_balance
  ON lv2_leave_ledger (tenant_id, employee_id, leave_type_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- Applied uniformly to all three tables. FORCE makes the policy bind the table
-- owner too (Prisma's role owns these), so there is no implicit bypass.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lv2_leave_types', 'lv2_leave_requests', 'lv2_leave_ledger']
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
