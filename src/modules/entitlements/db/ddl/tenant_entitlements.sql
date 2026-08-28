-- ============================================================================
-- Entitlements — ent_tenant_entitlements
--
-- RUN THIS BY HAND in psql or a SQL IDE. There is no migration runner for this
-- module and no Prisma migration: `prisma migrate deploy` will NOT create this
-- table, and neither will anything in the app's startup path. If the table is
-- missing, every QA route fails closed unless ENTITLEMENTS_ENFORCEMENT=off.
--
-- Safe to re-run: every statement is guarded, and the backfill is
-- ON CONFLICT DO NOTHING. Wrapped in a transaction so a failure part-way
-- through leaves nothing behind.
--
-- ─── WHAT THIS IS ───────────────────────────────────────────────────────────
--
-- ONE table: which PRODUCTS a tenant has bought.
--
--   product = a sellable SKU, not a module:
--     'zukvo'    full suite (every capability)
--     'testiez'  standalone QA product — QA Space + Bug List
--
--   The product → capability mapping lives in code (entitlements.service.ts),
--   NOT here. Capabilities change with the nav; grants change with billing.
--   Keeping them apart means re-packaging what a SKU includes never needs a
--   data change.
--
-- SAME DATA, TWO SURFACES:
--   Zukvo and Testiez share every table and every row. A tenant granted both
--   products sees the SAME qa_* and bug* rows through either front door. This
--   table controls ACCESS and BILLING — never data partitioning. There is no
--   product_id column anywhere in the QA schema and there should never be one.
--
-- UPGRADE PATH:
--   Testiez → full suite is an INSERT of one row. No data move, the tenant's
--   entire QA history intact. That is the whole commercial point of not
--   forking, so treat "upgrade must stay a single INSERT" as a constraint on
--   future changes here.
--
-- ID TYPE NOTE — tenant_id is TEXT, and that is deliberate:
--   `tenants.id` is text, not uuid. Prisma declares it `String @id @default(uuid())`
--   with no `@db.Uuid`, so the values are usually uuid-shaped but the column is
--   text — and at least one row is NOT uuid-shaped at all:
--
--     id='GLOBAL', name='Global System Templates', subdomain='global-system'
--
--   That row is active and owns a user, so getProducts('GLOBAL') is reachable
--   at runtime. A uuid column would make every such call raise
--   "invalid input syntax for type uuid" — which the middleware treats as a
--   failed check and fails CLOSED. Matching tenants.id exactly removes the
--   entire failure mode, and needs no casts anywhere.
--
--   Some newer modules (cd_*, lv2_*, om_*) use uuid and cast. Text is the
--   larger convention in this database (184 tables to 108) and is what `bugs`
--   — one of the tables this gates — already uses.
--
--   NO foreign key points at Prisma-owned tables, following the same
--   convention as the other raw-SQL modules: that integrity is enforced at the
--   application layer so the module stays decoupled from schema.prisma.
--
-- BACKFILL:
--   Every existing tenant is granted 'zukvo' below, so this is a no-op from any
--   current customer's point of view. Nothing is taken away, and enforcement
--   can be rolled out afterwards.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ent_tenant_entitlements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- text, matching tenants.id exactly — see ID TYPE NOTE above.
  tenant_id   text        NOT NULL,
  product     text        NOT NULL,
  status      text        NOT NULL DEFAULT 'active',
  -- how the grant was created: seeded backfill, sales-led provisioning, or
  -- (later) self-serve signup. Useful for revenue attribution.
  source      text        NOT NULL DEFAULT 'backfill',
  starts_at   timestamptz NOT NULL DEFAULT now(),
  -- NULL = perpetual. A non-null past value is treated as expired by the
  -- service regardless of `status`, so trials lapse without a cron job.
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ent_product_valid CHECK (product IN ('zukvo', 'testiez')),
  CONSTRAINT ent_status_valid  CHECK (status  IN ('active', 'suspended', 'expired'))
);

COMMENT ON TABLE ent_tenant_entitlements IS
  'Which products a tenant has bought. Controls access and billing only — Zukvo and Testiez share all underlying data.';

-- One grant per (tenant, product). Required for the ON CONFLICT backfill below
-- and for the idempotent upsert grantProduct() performs.
CREATE UNIQUE INDEX IF NOT EXISTS ent_tenant_entitlements_tenant_product_uq
  ON ent_tenant_entitlements (tenant_id, product);

-- The hot path: "what does this tenant have right now".
CREATE INDEX IF NOT EXISTS ent_tenant_entitlements_tenant_active_idx
  ON ent_tenant_entitlements (tenant_id)
  WHERE status = 'active';

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Runs BEFORE row-level security is enabled below. That ordering is load-
-- bearing: once FORCE RLS is on, this INSERT matches no rows, because whoever
-- runs this script sets no app.current_tenant_id.
-- Every tenant without exception, GLOBAL included — the point of the backfill
-- is that nobody's access changes when enforcement switches on.
INSERT INTO ent_tenant_entitlements (tenant_id, product, source)
SELECT id, 'zukvo', 'backfill'
FROM tenants
ON CONFLICT (tenant_id, product) DO NOTHING;

-- ── Row-level security ──────────────────────────────────────────────────────
-- FORCE so the table owner is bound by the policy too — the app connects as
-- owner, so without FORCE this would be decorative.
--
-- NOTE for whoever builds the super-admin entitlements UI: cross-tenant reads
-- are blocked by this policy by design. That screen needs its own policy
-- addition, not a bypass here.
--
-- Consequence for YOU, running this by hand: after this commits, a plain
-- `SELECT * FROM ent_tenant_entitlements` in your IDE returns ZERO ROWS unless
-- you set the tenant GUC first. That is the policy working, not lost data:
--
--   SET app.current_tenant_id = '<tenant-uuid>';
--   SELECT * FROM ent_tenant_entitlements;
--
-- To audit across all tenants, connect as a role with BYPASSRLS.
ALTER TABLE ent_tenant_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ent_tenant_entitlements FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ent_tenant_entitlements_tenant_isolation ON ent_tenant_entitlements;
CREATE POLICY ent_tenant_entitlements_tenant_isolation
  ON ent_tenant_entitlements
  -- No ::uuid cast, unlike cd_company_details. The GUC is set from tenants.id,
  -- which may be a non-uuid value such as 'GLOBAL'; casting would make the
  -- policy itself raise instead of simply matching no rows.
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''));

COMMIT;

-- ============================================================================
-- VERIFY (run separately, after the COMMIT above)
--
-- Row count bypasses RLS only for a BYPASSRLS/superuser role. If you get 0 as
-- a normal role, that is the policy, not a failed backfill — check with the
-- tenant GUC set as shown above.
-- ============================================================================
-- SELECT product, status, count(*)
--   FROM ent_tenant_entitlements
--  GROUP BY product, status
--  ORDER BY product;
--
-- Grant Testiez to one tenant by slug (the sales-led path; the app's
-- `npm run provision -- <slug> testiez` does exactly this):
--
-- INSERT INTO ent_tenant_entitlements (tenant_id, product, status, source)
-- SELECT id, 'testiez', 'active', 'sales' FROM tenants WHERE subdomain = 'acme'
-- ON CONFLICT (tenant_id, product)
-- DO UPDATE SET status = 'active', source = 'sales', updated_at = now();
