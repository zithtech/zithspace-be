-- ============================================================================
-- Opening Management — Phase 3: status lifecycle (migration 003)
--
-- The status VOCABULARY already shipped in 001 (the CHECK on om_openings.status
-- carries all ten values). What Phase 3 adds is the record of MOVEMENT between
-- them:
--
--   om_opening_status_history — append-only. One row per transition, including
--   the ones driven by the Phase 2 approval engine, so an opening has a single
--   timeline rather than one story in approvals and another in status.
--
-- Never UPDATE or DELETE a history row. A mistake is corrected by making the
-- opposite transition, which appends another row.
--
-- The legal transitions themselves live in the service layer (status.service),
-- not in a database constraint: they depend on the actor's permissions and on
-- which phase owns the move, and that is not expressible in a CHECK.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── om_opening_status_history ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS om_opening_status_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  opening_id   uuid NOT NULL REFERENCES om_openings (id) ON DELETE CASCADE,
  -- NULL only for the very first row, which records creation into 'draft'.
  from_status  text,
  to_status    text NOT NULL,
  -- Short machine-ish reason ('on_hold', 'rejected', 'auto_posting_move', …);
  -- `note` is the free-text explanation shown to humans.
  reason       text,
  note         text,
  /** True when a scheduled job made the move rather than a person (Phase 4). */
  is_automated boolean NOT NULL DEFAULT false,
  changed_by   uuid,
  changed_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_om_status_history_statuses CHECK (
    to_status IN ('draft', 'pending_approval', 'approved', 'internal_posting',
                  'external_posting', 'in_progress', 'on_hold', 'filled',
                  'cancelled', 'closed')
    AND (from_status IS NULL OR from_status IN
                 ('draft', 'pending_approval', 'approved', 'internal_posting',
                  'external_posting', 'in_progress', 'on_hold', 'filled',
                  'cancelled', 'closed'))
  ),
  CONSTRAINT ck_om_status_history_moves CHECK (from_status IS DISTINCT FROM to_status)
);

-- The timeline read: one opening, in order.
CREATE INDEX IF NOT EXISTS ix_om_status_history_opening
  ON om_opening_status_history (tenant_id, opening_id, changed_at DESC);

-- Resuming from on_hold looks up the last status before the hold.
CREATE INDEX IF NOT EXISTS ix_om_status_history_opening_to
  ON om_opening_status_history (opening_id, to_status);

-- ─── om_openings: status tracking ───────────────────────────────────────────
-- status_reason holds the reason for the CURRENT status (the same value written
-- to history), so list views can show "on hold — budget freeze" without joining.
ALTER TABLE om_openings
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason     text,
  ADD COLUMN IF NOT EXISTS status_note       text,
  ADD COLUMN IF NOT EXISTS closed_at         timestamptz;

-- Existing rows have never transitioned; treat creation as the status stamp.
UPDATE om_openings
   SET status_changed_at = created_at
 WHERE status_changed_at IS NULL;

-- Backfill a creation row for openings that pre-date this table, so every
-- opening has a timeline that starts somewhere.
INSERT INTO om_opening_status_history (tenant_id, opening_id, from_status, to_status, reason, changed_by, changed_at)
SELECT o.tenant_id, o.id, NULL, 'draft', 'created', o.created_by, o.created_at
  FROM om_openings o
 WHERE NOT EXISTS (
   SELECT 1 FROM om_opening_status_history h WHERE h.opening_id = o.id
 );

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE 'ALTER TABLE om_opening_status_history ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE om_opening_status_history FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON om_opening_status_history';
  EXECUTE $f$
    CREATE POLICY tenant_isolation ON om_opening_status_history
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  $f$;
END $$;
