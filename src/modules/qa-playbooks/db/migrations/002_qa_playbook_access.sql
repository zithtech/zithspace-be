-- QA Playbooks — authoring, visibility tiers and paid access.
--
-- WHAT CHANGED AND WHY:
--   Playbook content used to be authored as files in this repo and pushed into
--   these tables at boot. That made the repo a second authority over rows the
--   product now lets people edit, and the two would fight — an edit made in the
--   admin UI on Tuesday would be overwritten by Thursday's deploy. The database
--   is now the single source of truth; nothing writes these tables but the API.
--
-- THE THREE TIERS (qa_playbooks.visibility):
--   'public'     free. Every tenant sees it and can use it.
--   'premium'    every tenant SEES it, with the body locked until their tenant
--                holds a row in qa_playbook_unlocks. The catalog deliberately
--                still lists it — you cannot decide to buy what you cannot see.
--   'workspace'  owned by one tenant, visible to that tenant alone. This is
--                what a customer's own playbook is, and it is why the tier
--                exists at all: without it, saving a playbook would publish it
--                to every tenant on the platform.
--
-- OWNERSHIP is tenant_id, unchanged from migration 001:
--   NULL      = Testiez-owned (the maintained library). Only a super_admin can
--               create these, and only these may be 'public' or 'premium'.
--   <uuid>    = that tenant's own playbook. Always 'workspace'.
--   The constraint below enforces exactly that pairing, so a tenant cannot
--   publish to the whole platform by putting 'public' in a request body.

-- ─── Tiering, ownership rules and lifecycle ─────────────────────────────────
ALTER TABLE qa_playbooks
  ADD COLUMN IF NOT EXISTS visibility     TEXT NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'draft',   -- draft | published | archived
  ADD COLUMN IF NOT EXISTS price_credits  INTEGER,
  ADD COLUMN IF NOT EXISTS price_amount   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS created_by     UUID;

-- Everything that existed before this migration came from the shipped library
-- and was already readable by every tenant, so it stays that way.
UPDATE qa_playbooks
   SET visibility = 'public', status = 'published'
 WHERE tenant_id IS NULL AND visibility = 'workspace';

-- `source` said 'global' or 'project'. Ownership (tenant_id) plus visibility
-- now carry that meaning without a third column drifting out of step.
ALTER TABLE qa_playbooks DROP COLUMN IF EXISTS source;

ALTER TABLE qa_playbooks DROP CONSTRAINT IF EXISTS qa_playbooks_visibility_chk;
ALTER TABLE qa_playbooks ADD CONSTRAINT qa_playbooks_visibility_chk
  CHECK (visibility IN ('public', 'premium', 'workspace'));

ALTER TABLE qa_playbooks DROP CONSTRAINT IF EXISTS qa_playbooks_status_chk;
ALTER TABLE qa_playbooks ADD CONSTRAINT qa_playbooks_status_chk
  CHECK (status IN ('draft', 'published', 'archived'));

-- The rule that makes the tiers safe, enforced by the database rather than by
-- remembering to check it in every handler: a tenant-owned playbook can only
-- ever be 'workspace', and a platform playbook can never be 'workspace'.
ALTER TABLE qa_playbooks DROP CONSTRAINT IF EXISTS qa_playbooks_owner_visibility_chk;
ALTER TABLE qa_playbooks ADD CONSTRAINT qa_playbooks_owner_visibility_chk
  CHECK (
    (tenant_id IS NULL     AND visibility IN ('public', 'premium')) OR
    (tenant_id IS NOT NULL AND visibility = 'workspace')
  );

CREATE INDEX IF NOT EXISTS qa_playbooks_visibility_idx
  ON qa_playbooks (visibility, status);
CREATE INDEX IF NOT EXISTS qa_playbooks_owner_idx
  ON qa_playbooks (tenant_id) WHERE tenant_id IS NOT NULL;

-- ─── Unlocks: which tenant may open which premium playbook ──────────────────
-- One row = one tenant's perpetual (or dated) access. Today rows are written by
-- a super_admin granting access; when real payment lands it writes the same row
-- with origin='purchase' and a payment reference. Nothing downstream changes.
CREATE TABLE IF NOT EXISTS qa_playbook_unlocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id   UUID NOT NULL REFERENCES qa_playbooks(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL,
  origin        TEXT NOT NULL DEFAULT 'admin_grant',   -- admin_grant | purchase
  -- Credits/amount actually charged, kept for the ledger even while grants are
  -- free, so reporting does not need to reconstruct history later.
  credits_spent INTEGER,
  amount_paid   NUMERIC(12,2),
  currency      TEXT,
  payment_ref   TEXT,
  note          TEXT,
  granted_by    UUID,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  /** NULL = perpetual. A dated unlock expires and the playbook re-locks. */
  expires_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_unlocks_uidx
  ON qa_playbook_unlocks (playbook_id, tenant_id);
CREATE INDEX IF NOT EXISTS qa_playbook_unlocks_tenant_idx
  ON qa_playbook_unlocks (tenant_id);

-- ─── Unlock requests: the tenant-side ask, and its decision ─────────────────
CREATE TABLE IF NOT EXISTS qa_playbook_unlock_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id  UUID NOT NULL REFERENCES qa_playbooks(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL,
  requested_by UUID,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',        -- pending | approved | declined
  decided_by   UUID,
  decided_at   TIMESTAMPTZ,
  decision_note TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qa_playbook_unlock_requests DROP CONSTRAINT IF EXISTS qa_playbook_unlock_requests_status_chk;
ALTER TABLE qa_playbook_unlock_requests ADD CONSTRAINT qa_playbook_unlock_requests_status_chk
  CHECK (status IN ('pending', 'approved', 'declined'));

-- One open request per tenant per playbook — asking twice should not queue two
-- decisions for an admin to make.
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_unlock_requests_open_uidx
  ON qa_playbook_unlock_requests (playbook_id, tenant_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS qa_playbook_unlock_requests_status_idx
  ON qa_playbook_unlock_requests (status, created_at DESC);
