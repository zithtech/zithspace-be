-- ============================================================================
-- Opening Management — Phase 1 schema (migration 001)
--
-- Pure raw-SQL module. These tables are NOT in schema.prisma and are managed
-- exclusively by the opening-management migration runner. All tables are
-- prefixed `om_` so they never collide with the legacy Prisma-managed
-- `opening_managements` table, which this module deliberately does NOT touch.
--
-- Tenant isolation = two independent layers:
--   1. RLS policies below (FORCE'd, so even the table owner is bound by them).
--   2. Explicit `tenant_id = $1` filters in every repository query.
-- The app sets `app.current_tenant_id` per transaction via withTenant().
--
-- ID TYPE NOTE — read before adding columns:
--   `tenant_id`, `created_by`, `updated_by` are uuid (Prisma generates uuid for
--   tenants and users). But ids pointing at OTHER Prisma-owned tables are stored
--   as `text`, NOT uuid, because Prisma stores String ids as text and not all of
--   them are uuids — e.g. recruitment_client_basic_information.id is a cuid.
--   text also lets us LEFT JOIN those tables without a cast.
--   No foreign keys point at Prisma-owned tables: referential integrity for
--   those ids is enforced at the application layer, keeping the module
--   decoupled from the Prisma schema.
--
-- The `status` CHECK already carries the full Phase 3 status vocabulary so the
-- later phases add behaviour, not schema churn. Phase 1 only ever writes
-- 'draft'.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── om_openings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS om_openings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  -- Human-readable reference, generated per tenant: OPN-00001, OPN-00002, …
  opening_code        text NOT NULL,

  -- ── Linkage (Phase 1) ──────────────────────────────────────────────────
  client_id           text,   -- recruitment_client_basic_information.id | clients_v2.id
  project_id          text,   -- projects.id
  department_id       text,   -- departments.id
  sub_department_id   text,   -- sub_departments.id
  hiring_manager_id   text,   -- users.id
  employment_type_id  text,   -- employment_types.id (optional master-data link)
  employment_type     text NOT NULL
                        CHECK (employment_type IN
                          ('full_time', 'part_time', 'contract', 'internship', 'freelance')),
  work_mode           text NOT NULL
                        CHECK (work_mode IN ('remote', 'hybrid', 'office')),
  location_id         text,   -- company_locations.id
  location            text,   -- free-text location when no master row applies
  number_of_positions integer NOT NULL DEFAULT 1 CHECK (number_of_positions > 0),

  -- ── Job details (Phase 1) ──────────────────────────────────────────────
  job_title           text NOT NULL,
  job_description     text,
  responsibilities    text,
  required_skills     text[] NOT NULL DEFAULT '{}',
  preferred_skills    text[] NOT NULL DEFAULT '{}',
  min_experience      numeric(4, 1) CHECK (min_experience >= 0),   -- years
  max_experience      numeric(4, 1) CHECK (max_experience >= 0),   -- years
  education           text,
  certifications      text[] NOT NULL DEFAULT '{}',
  salary_min          numeric(14, 2) CHECK (salary_min >= 0),
  salary_max          numeric(14, 2) CHECK (salary_max >= 0),
  salary_currency     text NOT NULL DEFAULT 'INR',
  salary_period       text NOT NULL DEFAULT 'yearly'
                        CHECK (salary_period IN ('hourly', 'monthly', 'yearly')),
  budget              numeric(14, 2) CHECK (budget >= 0),
  notice_period_days  integer CHECK (notice_period_days >= 0),
  shift_timing        text,
  joining_timeline    text,   -- e.g. 'Immediate', 'Within 30 days'
  target_joining_date date,

  -- ── Classification (enterprise extras) ─────────────────────────────────
  priority            text NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  hiring_type         text
                        CHECK (hiring_type IN
                          ('replacement', 'new_position', 'expansion', 'backfill')),
  visibility          text NOT NULL DEFAULT 'both'
                        CHECK (visibility IN ('internal_only', 'external_only', 'both')),

  -- ── Lifecycle (full Phase 3 vocabulary; Phase 1 writes only 'draft') ────
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft',
                          'pending_approval',
                          'approved',
                          'internal_posting',
                          'external_posting',
                          'in_progress',
                          'on_hold',
                          'filled',
                          'cancelled',
                          'closed'
                        )),

  created_by          uuid,
  updated_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  CONSTRAINT ck_om_openings_experience_range
    CHECK (min_experience IS NULL OR max_experience IS NULL OR max_experience >= min_experience),
  CONSTRAINT ck_om_openings_salary_range
    CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min)
);

-- Opening code is unique per tenant among non-deleted rows. This index is also
-- what makes the read-max-then-insert code generator safe under concurrency:
-- a racing insert loses here and the service retries.
CREATE UNIQUE INDEX IF NOT EXISTS uq_om_openings_tenant_code
  ON om_openings (tenant_id, opening_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_om_openings_tenant_status
  ON om_openings (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_om_openings_tenant_department
  ON om_openings (tenant_id, department_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_om_openings_tenant_client
  ON om_openings (tenant_id, client_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_om_openings_tenant_hiring_manager
  ON om_openings (tenant_id, hiring_manager_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_om_openings_tenant_created_at
  ON om_openings (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─── om_opening_recruiters ──────────────────────────────────────────────────
-- One or more recruiters assigned to an opening; at most one is the primary.
CREATE TABLE IF NOT EXISTS om_opening_recruiters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  opening_id   uuid NOT NULL REFERENCES om_openings (id) ON DELETE CASCADE,
  recruiter_id text NOT NULL,   -- users.id
  is_primary   boolean NOT NULL DEFAULT false,
  assigned_by  uuid,
  assigned_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_om_opening_recruiters_member
  ON om_opening_recruiters (opening_id, recruiter_id);

-- At most one primary recruiter per opening.
CREATE UNIQUE INDEX IF NOT EXISTS uq_om_opening_recruiters_one_primary
  ON om_opening_recruiters (opening_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS ix_om_opening_recruiters_tenant_recruiter
  ON om_opening_recruiters (tenant_id, recruiter_id);

-- ─── om_opening_hiring_team ─────────────────────────────────────────────────
-- Hiring manager / technical panel / HR / client interviewers.
-- `member_id` is NULL for client-side interviewers who have no platform user,
-- in which case member_name (and optionally member_email) carries the identity.
CREATE TABLE IF NOT EXISTS om_opening_hiring_team (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  opening_id   uuid NOT NULL REFERENCES om_openings (id) ON DELETE CASCADE,
  member_type  text NOT NULL
                 CHECK (member_type IN
                   ('hiring_manager', 'technical_panel', 'hr', 'client_interviewer')),
  member_id    text,   -- users.id, NULL for external interviewers
  member_name  text,
  member_email text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_om_hiring_team_identity
    CHECK (member_id IS NOT NULL OR member_name IS NOT NULL)
);

-- A platform user appears once per role on an opening. External members are
-- excluded from the constraint (member_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_om_opening_hiring_team_member
  ON om_opening_hiring_team (opening_id, member_type, member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_om_opening_hiring_team_opening
  ON om_opening_hiring_team (tenant_id, opening_id);

-- ─── om_opening_documents ───────────────────────────────────────────────────
-- Documents a candidate must supply for this opening (Resume, Aadhaar, PAN, …).
CREATE TABLE IF NOT EXISTS om_opening_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  opening_id    uuid NOT NULL REFERENCES om_openings (id) ON DELETE CASCADE,
  document_name text NOT NULL,
  is_mandatory  boolean NOT NULL DEFAULT true,
  notes         text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_om_opening_documents_name
  ON om_opening_documents (opening_id, lower(document_name));

CREATE INDEX IF NOT EXISTS ix_om_opening_documents_opening
  ON om_opening_documents (tenant_id, opening_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- FORCE makes the policy bind the table owner too (Prisma's role owns these),
-- so there is no implicit bypass.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'om_openings',
    'om_opening_recruiters',
    'om_opening_hiring_team',
    'om_opening_documents'
  ]
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
