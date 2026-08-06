-- ============================================================================
-- Opening Management — Phase 7: closing and archiving (migration 007)
--
-- Phase 3 already moved openings to `closed` / `cancelled`; what was missing is
-- WHY, and the archive that follows. This migration adds both to om_openings —
-- no new table, because this is one-to-one with the opening and a side table
-- would only add a join to every read.
--
--   closure_reason   position_filled | cancelled | budget_issue |
--                    client_cancelled | duplicate_opening
--   is_archived      set automatically when an opening is closed, so finished
--                    work leaves the working list without being deleted.
--
-- `closed_at` already exists from Phase 3 (005 era) and keeps its meaning: when
-- recruitment stopped. `archived_at` is separate because an opening can be
-- closed now and archived later, or un-archived without re-opening.
-- ============================================================================

ALTER TABLE om_openings
  ADD COLUMN IF NOT EXISTS closure_reason          text,
  ADD COLUMN IF NOT EXISTS closure_note            text,
  ADD COLUMN IF NOT EXISTS closed_by               uuid,
  -- Only meaningful when closure_reason = 'duplicate_opening': points at the
  -- opening this one duplicates, so the trail is not just a note.
  ADD COLUMN IF NOT EXISTS duplicate_of_opening_id uuid,
  ADD COLUMN IF NOT EXISTS is_archived             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at             timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by             uuid;

-- Added separately from the columns: ALTER TABLE ... ADD CONSTRAINT has no
-- IF NOT EXISTS, so re-running would error. The catalog check makes the whole
-- migration safely re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_om_openings_closure_reason'
  ) THEN
    ALTER TABLE om_openings ADD CONSTRAINT ck_om_openings_closure_reason CHECK (
      closure_reason IS NULL OR closure_reason IN (
        'position_filled',
        'cancelled',
        'budget_issue',
        'client_cancelled',
        'duplicate_opening'
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_om_openings_duplicate_link'
  ) THEN
    -- A duplicate must name its original, and only a duplicate may.
    ALTER TABLE om_openings ADD CONSTRAINT ck_om_openings_duplicate_link CHECK (
      (closure_reason = 'duplicate_opening' AND duplicate_of_opening_id IS NOT NULL)
      OR (closure_reason IS DISTINCT FROM 'duplicate_opening' AND duplicate_of_opening_id IS NULL)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_om_openings_no_self_duplicate'
  ) THEN
    ALTER TABLE om_openings ADD CONSTRAINT ck_om_openings_no_self_duplicate CHECK (
      duplicate_of_opening_id IS NULL OR duplicate_of_opening_id <> id
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_om_openings_archived_stamp'
  ) THEN
    -- An archived opening always knows when it was archived.
    ALTER TABLE om_openings ADD CONSTRAINT ck_om_openings_archived_stamp CHECK (
      (is_archived AND archived_at IS NOT NULL) OR (NOT is_archived AND archived_at IS NULL)
    );
  END IF;
END $$;

-- The working list excludes archived rows, so that is the shape to index.
CREATE INDEX IF NOT EXISTS ix_om_openings_active_not_archived
  ON om_openings (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL AND NOT is_archived;

-- The archive view, and closure reporting.
CREATE INDEX IF NOT EXISTS ix_om_openings_archived
  ON om_openings (tenant_id, archived_at DESC)
  WHERE deleted_at IS NULL AND is_archived;

CREATE INDEX IF NOT EXISTS ix_om_openings_closure_reason
  ON om_openings (tenant_id, closure_reason)
  WHERE deleted_at IS NULL AND closure_reason IS NOT NULL;
