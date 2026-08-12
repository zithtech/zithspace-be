-- ============================================================================
-- Opening Management — accept candidates from the recruitment pipeline (009)
--
-- WHY: the platform has TWO candidate stores, which pre-dates this module —
--   `candidates`           Prisma-managed, used by the ATS candidate screens.
--   `pipeline_candidates`  owned by the pipeline module (/pipeline/candidates),
--                          created by its own resume-upload flow.
--
-- Phase 5 only knew about the first, so a candidate added on the pipeline page
-- could never appear on an opening. Rather than duplicate candidate records
-- between the two tables — which would immediately drift — an application now
-- points at EITHER store, and the read query coalesces the display fields.
--
-- The CHECK enforces exactly one source, so an application can never be
-- ambiguous about who it is for.
-- ============================================================================

ALTER TABLE om_opening_applications
  ADD COLUMN IF NOT EXISTS pipeline_candidate_id uuid;

-- candidate_id was NOT NULL; a pipeline-sourced application leaves it empty.
ALTER TABLE om_opening_applications
  ALTER COLUMN candidate_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_om_applications_one_candidate_source'
  ) THEN
    ALTER TABLE om_opening_applications
      ADD CONSTRAINT ck_om_applications_one_candidate_source CHECK (
        (candidate_id IS NOT NULL AND pipeline_candidate_id IS NULL)
        OR (candidate_id IS NULL AND pipeline_candidate_id IS NOT NULL)
      );
  END IF;
END $$;

-- The original "one application per candidate per opening" index assumed
-- candidate_id was always present. Scope it, and add the pipeline equivalent.
DROP INDEX IF EXISTS uq_om_applications_candidate;

CREATE UNIQUE INDEX IF NOT EXISTS uq_om_applications_candidate
  ON om_opening_applications (opening_id, candidate_id)
  WHERE deleted_at IS NULL AND candidate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_om_applications_pipeline_candidate
  ON om_opening_applications (opening_id, pipeline_candidate_id)
  WHERE deleted_at IS NULL AND pipeline_candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_om_applications_pipeline_candidate
  ON om_opening_applications (tenant_id, pipeline_candidate_id)
  WHERE deleted_at IS NULL AND pipeline_candidate_id IS NOT NULL;
