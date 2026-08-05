-- ============================================================================
-- Opening Management — Phase 4: posting lifecycle (migration 005)
--
--   approved ─▶ internal posting (N days) ─▶ auto-move ─▶ external posting
--
-- Two tables:
--   om_posting_settings  — one row per tenant: how long the internal window is
--                          and whether the auto-move runs at all.
--   om_opening_postings  — one row per posting EVENT. An opening that is posted
--                          internally, auto-moved, then re-posted externally has
--                          three rows; the table is the posting history.
--
-- SOURCE OF TRUTH: om_opening_postings. `om_openings.internal_posting_ends_at`
-- is a denormalised copy so list views can show "3 days left" without a join —
-- it is written in the same transaction as the posting row and must never be
-- updated on its own.
--
-- The auto-move itself is a scheduled job (jobs/postingAutoMove.ts). It finds
-- rows where the internal window has expired and walks them to external posting,
-- writing `is_automated = true` on the resulting status-history row so the
-- timeline distinguishes machine moves from human ones.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── om_posting_settings (one row per tenant) ───────────────────────────────
CREATE TABLE IF NOT EXISTS om_posting_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  -- The spec's 15-day internal window; configurable per tenant.
  internal_posting_days integer NOT NULL DEFAULT 15
                          CHECK (internal_posting_days BETWEEN 1 AND 365),
  -- Tenant-wide kill switch for the auto-move. A per-opening override lives on
  -- the posting row, so turning this off does not rewrite work already posted.
  auto_move_to_external  boolean NOT NULL DEFAULT true,
  created_by            uuid,
  updated_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_om_posting_settings_tenant
  ON om_posting_settings (tenant_id);

-- ─── om_opening_postings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS om_opening_postings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  opening_id    uuid NOT NULL REFERENCES om_openings (id) ON DELETE CASCADE,
  posting_type  text NOT NULL CHECK (posting_type IN ('internal', 'external')),
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'expired', 'closed')),
  posted_at     timestamptz NOT NULL DEFAULT now(),
  -- Internal postings only: when the window closes. NULL for external, which
  -- runs until recruitment ends.
  expires_at    timestamptz,
  -- Per-posting override of the tenant auto-move setting, captured at posting
  -- time so changing the tenant default cannot retroactively move live work.
  auto_move     boolean NOT NULL DEFAULT false,
  moved_at      timestamptz,   -- when this posting handed over to the next one
  closed_at     timestamptz,
  closed_reason text,
  posted_by     uuid,
  /** True when the scheduled auto-move created or closed this row. */
  is_automated  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- An internal posting must have a window; an external one must not.
  CONSTRAINT ck_om_postings_expiry CHECK (
    (posting_type = 'internal' AND expires_at IS NOT NULL) OR
    (posting_type = 'external' AND expires_at IS NULL)
  ),
  CONSTRAINT ck_om_postings_window CHECK (expires_at IS NULL OR expires_at > posted_at)
);

-- One live posting per channel per opening. Re-posting internally after the
-- first window closed is fine — the old row is no longer 'active'.
CREATE UNIQUE INDEX IF NOT EXISTS uq_om_postings_active
  ON om_opening_postings (opening_id, posting_type)
  WHERE status = 'active';

-- The auto-move sweep: due internal postings, cheapest possible scan.
CREATE INDEX IF NOT EXISTS ix_om_postings_due
  ON om_opening_postings (expires_at)
  WHERE status = 'active' AND posting_type = 'internal' AND auto_move;

CREATE INDEX IF NOT EXISTS ix_om_postings_opening
  ON om_opening_postings (tenant_id, opening_id, posted_at DESC);

-- ─── om_openings: denormalised posting window ───────────────────────────────
ALTER TABLE om_openings
  ADD COLUMN IF NOT EXISTS internal_posting_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_internally_at     timestamptz,
  ADD COLUMN IF NOT EXISTS posted_externally_at     timestamptz;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['om_posting_settings', 'om_opening_postings']
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
