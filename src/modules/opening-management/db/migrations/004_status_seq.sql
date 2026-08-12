-- ============================================================================
-- Opening Management — status history ordering key (migration 004)
--
-- WHY this is a separate migration and not an edit to 003: 003 has already been
-- applied, and the runner is forward-only — it will never re-run a file it has
-- recorded. Every schema change after the fact gets its own file.
--
-- THE PROBLEM: the timeline was ordered by `changed_at`, with `id` as the
-- tiebreaker. Two rows written in the same transaction share now() exactly, and
-- `id` is a random uuid — so the order came back scrambled. For an audit trail,
-- order is the whole point.
--
-- THE FIX: a monotonic `seq`. Assigned from a sequence, never reused, always
-- increasing. All timeline reads order by it.
-- ============================================================================

-- Plain bigint first, so existing rows can be backfilled deterministically
-- (ADD COLUMN … bigserial would assign values in arbitrary physical order).
ALTER TABLE om_opening_status_history
  ADD COLUMN IF NOT EXISTS seq bigint;

-- Backfill in chronological order, so history written before this migration
-- keeps the sequence it actually happened in.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY changed_at, id) AS rn
    FROM om_opening_status_history
   WHERE seq IS NULL
)
UPDATE om_opening_status_history h
   SET seq = ordered.rn
  FROM ordered
 WHERE h.id = ordered.id;

-- Attach a sequence and continue past whatever the backfill used.
CREATE SEQUENCE IF NOT EXISTS om_opening_status_history_seq_seq
  OWNED BY om_opening_status_history.seq;

SELECT setval(
  'om_opening_status_history_seq_seq',
  COALESCE((SELECT MAX(seq) FROM om_opening_status_history), 0) + 1,
  false
);

ALTER TABLE om_opening_status_history
  ALTER COLUMN seq SET DEFAULT nextval('om_opening_status_history_seq_seq');

ALTER TABLE om_opening_status_history
  ALTER COLUMN seq SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_om_status_history_seq
  ON om_opening_status_history (seq);

-- Re-point the read indexes at seq. The changed_at variants are dropped: no
-- query orders by changed_at any more, so they would only cost write time.
DROP INDEX IF EXISTS ix_om_status_history_opening;
CREATE INDEX IF NOT EXISTS ix_om_status_history_opening
  ON om_opening_status_history (tenant_id, opening_id, seq DESC);

DROP INDEX IF EXISTS ix_om_status_history_opening_to;
CREATE INDEX IF NOT EXISTS ix_om_status_history_opening_to
  ON om_opening_status_history (opening_id, to_status, seq DESC);
