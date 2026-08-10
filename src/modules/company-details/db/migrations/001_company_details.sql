-- ============================================================================
-- Company Details — initial schema (migration 001)
--
-- Replaces the Prisma-managed `company_locations` table with a raw-SQL module.
-- Two tables:
--   cd_company_details  — exactly ONE row per tenant: the registered entity
--                         (legal name, GST, primary contact, head-office address).
--   cd_company_branches — zero or more additional branch locations. Each branch
--                         either reuses the company's primary email or carries
--                         its own (`use_company_email` decides which).
--
-- Tenant isolation = two independent layers:
--   1. RLS policies below (FORCE'd, so even the table owner is bound by them).
--   2. Explicit `tenant_id = $1` filters in every repository query.
-- The app sets `app.current_tenant_id` per transaction via withTenant().
--
-- ID TYPE NOTE:
--   `tenant_id`, `created_by`, `updated_by` are uuid (Prisma generates uuid for
--   tenants and users). No foreign keys point at Prisma-owned tables — that
--   integrity is enforced at the application layer so the module stays
--   decoupled from schema.prisma.
--
-- BACKFILL:
--   Existing `company_locations` rows are copied into cd_company_branches with
--   their ORIGINAL ids. That matters: om_openings.location_id stores a
--   company_locations.id as text, so preserving ids keeps every existing
--   opening pointing at the right place. The old table is left in the database
--   untouched (read-only leftover) — drop it manually once you're satisfied
--   with the migration.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── cd_company_details ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cd_company_details (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One registered company per tenant. The UNIQUE constraint is what makes the
  -- "save" endpoint a safe upsert (ON CONFLICT (tenant_id) DO UPDATE).
  tenant_id          uuid NOT NULL UNIQUE,

  -- ── Identity ───────────────────────────────────────────────────────────
  registered_name    text NOT NULL,
  gst_number         text,
  primary_email      text NOT NULL,
  primary_phone      text NOT NULL,

  -- ── Registered address (head office) ───────────────────────────────────
  door_number        text,
  floor              text,
  building           text,
  area               text,
  street             text,
  city               text,
  district           text,
  state              text,
  pincode            text,
  country            text,

  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── cd_company_branches ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cd_company_branches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,

  branch_name        text NOT NULL,

  -- Email routing: when true the branch inherits cd_company_details.primary_email
  -- and `branch_email` stays NULL. When false a branch-specific email is
  -- REQUIRED — enforced by the CHECK below so no row can be half-configured.
  use_company_email  boolean NOT NULL DEFAULT true,
  branch_email       text,
  branch_phone       text,

  -- ── Branch address ─────────────────────────────────────────────────────
  door_number        text,
  floor              text,
  building           text,
  area               text,
  street             text,
  city               text,
  district           text,
  state              text,
  pincode            text,
  country            text,

  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cd_branch_email_present
    CHECK (use_company_email OR (branch_email IS NOT NULL AND branch_email <> ''))
);

CREATE INDEX IF NOT EXISTS cd_company_branches_tenant_idx
  ON cd_company_branches (tenant_id, created_at DESC);

-- ─── Backfill from the retired company_locations table ──────────────────────
-- Guarded by to_regclass so a fresh database (where the old table never existed)
-- applies this migration cleanly.
DO $$
BEGIN
  IF to_regclass('public.company_locations') IS NOT NULL THEN
    INSERT INTO cd_company_branches (
      id, tenant_id, branch_name, use_company_email,
      door_number, area, street, city, state, pincode, country,
      created_by, updated_by, created_at, updated_at
    )
    SELECT
      l.id::uuid,
      l.tenant_id::uuid,
      -- Old rows had no name; the city is the most recognisable label we have.
      COALESCE(NULLIF(l.city, ''), 'Branch'),
      true,
      l.flat_number, l.area, l.street, l.city, l.state, l.pincode, l.country,
      l.created_by_id::uuid, l.updated_by_id::uuid, l.created_at, l.updated_at
    FROM company_locations l
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ─── Row Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cd_company_details', 'cd_company_branches'] LOOP
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
