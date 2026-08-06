-- ============================================================================
-- Opening Management — Phase 5: candidate intake (migration 006)
--
-- WHAT WAS MISSING: the platform already has a rich `candidates` table (Prisma-
-- managed, with work history, skill matrix, education, documents), but nothing
-- connects a candidate to an opening. This migration adds that join — the ATS
-- "application" — and nothing else. Candidate master data is NOT duplicated
-- here; `candidate_id` points at the existing table and the read queries join
-- to it for display.
--
--   om_opening_applications      one candidate ↔ one opening, plus the source
--                                they came through and where they are in the
--                                pipeline.
--   om_application_stage_history append-only stage timeline. Same pattern as
--                                the Phase 3 status history, including the
--                                monotonic `seq` — Phase 6's time-in-stage
--                                metrics will read it.
--
-- The `stage` vocabulary is chosen to answer the Phase 6 dashboard directly:
--   applied → Applications · screening/shortlisted → Screened · interview →
--   Interview · offer → Offers · hired → Joined · rejected → Rejected
-- so that phase is aggregation over this column, not new bookkeeping.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── om_opening_applications ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS om_opening_applications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  opening_id       uuid NOT NULL REFERENCES om_openings (id) ON DELETE CASCADE,
  -- candidates.id — text, no FK: the module keeps no foreign keys into the
  -- Prisma schema. Existence is checked in the service layer.
  candidate_id     text NOT NULL,

  -- ── Where they came from (the spec's intake channels) ──────────────────
  source           text NOT NULL
                     CHECK (source IN (
                       'careers_page',
                       'employee_referral',
                       'internal_transfer',
                       'internal_job_posting',
                       'recruitment_agency',
                       'linkedin',
                       'naukri',
                       'indeed',
                       'manual_upload',
                       'campus_hiring',
                       'other'
                     )),
  -- The specifics the channel alone does not carry: agency name, campus name,
  -- job-board campaign, "other" description.
  source_detail    text,
  -- users.id of the referrer, for source = 'employee_referral'.
  referred_by      text,

  -- ── Where they are ─────────────────────────────────────────────────────
  stage            text NOT NULL DEFAULT 'applied'
                     CHECK (stage IN (
                       'applied',
                       'screening',
                       'shortlisted',
                       'interview',
                       'offer',
                       'hired',
                       'rejected',
                       'withdrawn',
                       'on_hold'
                     )),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  rejection_reason text,

  applied_at       timestamptz NOT NULL DEFAULT now(),
  -- Snapshot of the CV actually submitted for this opening. The candidate's
  -- master resume may be replaced later; this records what was reviewed.
  resume_url       text,
  notes            text,

  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,

  CONSTRAINT ck_om_applications_referral CHECK (
    source <> 'employee_referral' OR referred_by IS NOT NULL
  )
);

-- A candidate applies to a given opening once. Re-adding after a soft delete is
-- allowed, which is what makes the partial index the right shape.
CREATE UNIQUE INDEX IF NOT EXISTS uq_om_applications_candidate
  ON om_opening_applications (opening_id, candidate_id)
  WHERE deleted_at IS NULL;

-- The pipeline board: one opening, grouped by stage.
CREATE INDEX IF NOT EXISTS ix_om_applications_opening_stage
  ON om_opening_applications (tenant_id, opening_id, stage)
  WHERE deleted_at IS NULL;

-- "Where else has this candidate applied?"
CREATE INDEX IF NOT EXISTS ix_om_applications_candidate
  ON om_opening_applications (tenant_id, candidate_id)
  WHERE deleted_at IS NULL;

-- Source-effectiveness reporting (Phase 6).
CREATE INDEX IF NOT EXISTS ix_om_applications_source
  ON om_opening_applications (tenant_id, source)
  WHERE deleted_at IS NULL;

-- ─── om_application_stage_history ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS om_application_stage_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Monotonic ordering key, for the same reason as the status history: rows
  -- written in one transaction share now(), and a uuid tiebreaker is arbitrary.
  seq            bigserial NOT NULL UNIQUE,
  tenant_id      uuid NOT NULL,
  application_id uuid NOT NULL REFERENCES om_opening_applications (id) ON DELETE CASCADE,
  from_stage     text,   -- NULL on the intake row
  to_stage       text NOT NULL,
  note           text,
  changed_by     uuid,
  changed_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_om_stage_history_stages CHECK (
    to_stage IN ('applied','screening','shortlisted','interview','offer',
                 'hired','rejected','withdrawn','on_hold')
    AND (from_stage IS NULL OR from_stage IN
                ('applied','screening','shortlisted','interview','offer',
                 'hired','rejected','withdrawn','on_hold'))
  ),
  CONSTRAINT ck_om_stage_history_moves CHECK (from_stage IS DISTINCT FROM to_stage)
);

CREATE INDEX IF NOT EXISTS ix_om_stage_history_application
  ON om_application_stage_history (tenant_id, application_id, seq DESC);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['om_opening_applications', 'om_application_stage_history']
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
