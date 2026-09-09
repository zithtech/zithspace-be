-- QA Playbooks — a collection as something you can buy.
--
-- WHAT A PREMIUM COLLECTION ACTUALLY IS, because this is the decision everything
-- below follows from:
--
--   A collection is a BUNDLE, not a paywall in front of a page. Its detail page
--   stays readable whatever its tier — you cannot decide to buy a pack whose
--   contents you cannot see, the same rule migration 002 applies to a premium
--   playbook. What an unlock grants is access to the BODIES of the playbooks
--   the collection contains.
--
--   So: a public collection containing premium playbooks is normal and correct.
--   The pack lists them with their locks, and a customer may buy either one
--   playbook or the whole pack. `visibility = 'premium'` on a collection means
--   "this bundle is offered for sale", nothing more.
--
-- PACK GROWTH IS DYNAMIC — the decided semantics, and the reason there is no
-- purchase-time snapshot table here. Access is resolved live:
--
--     a playbook is unlocked if the tenant holds an unlock for THE PLAYBOOK
--     or an unlock for ANY collection that contains it RIGHT NOW
--
--   Add a playbook to the Fintech pack next month and everyone who bought that
--   pack has it, without a backfill. Remove one and they lose it, which is why
--   curation of a SOLD pack is an editorial act, not a tidy-up. That is the
--   trade knowingly accepted: "the pack keeps growing" is the selling point,
--   and one live join is cheaper than fanning out forty unlock rows per sale.
--
-- THE TWO TABLES mirror qa_playbook_unlocks and qa_playbook_unlock_requests
-- exactly. A separate request table rather than a nullable playbook_id on the
-- existing one, for the reason migration 003 already gives: a column that is
-- NULL for half a table's rows is a second entity wearing the first one's
-- schema.

-- ─── Unlocks: which tenant has bought which pack ────────────────────────────
CREATE TABLE IF NOT EXISTS qa_playbook_collection_unlocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES qa_playbook_collections(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL,
  origin        TEXT NOT NULL DEFAULT 'admin_grant',   -- admin_grant | purchase
  credits_spent INTEGER,
  amount_paid   NUMERIC(12,2),
  currency      TEXT,
  payment_ref   TEXT,
  note          TEXT,
  granted_by    UUID,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  /** NULL = perpetual. A dated unlock expires and the pack re-locks. */
  expires_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_collection_unlocks_uidx
  ON qa_playbook_collection_unlocks (collection_id, tenant_id);
CREATE INDEX IF NOT EXISTS qa_playbook_collection_unlocks_tenant_idx
  ON qa_playbook_collection_unlocks (tenant_id);

-- ─── Unlock requests: the tenant-side ask, and its decision ─────────────────
CREATE TABLE IF NOT EXISTS qa_playbook_collection_unlock_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES qa_playbook_collections(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL,
  requested_by  UUID,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',       -- pending | approved | declined
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qa_playbook_collection_unlock_requests
  DROP CONSTRAINT IF EXISTS qa_playbook_collection_unlock_requests_status_chk;
ALTER TABLE qa_playbook_collection_unlock_requests
  ADD CONSTRAINT qa_playbook_collection_unlock_requests_status_chk
  CHECK (status IN ('pending', 'approved', 'declined'));

-- One open request per tenant per pack. Two QAs on the same team asking for
-- Fintech must not put two decisions in front of an admin.
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_collection_unlock_requests_open_uidx
  ON qa_playbook_collection_unlock_requests (collection_id, tenant_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS qa_playbook_collection_unlock_requests_status_idx
  ON qa_playbook_collection_unlock_requests (status, created_at DESC);

-- The join that resolves access lives on the hot path of every catalog read —
-- "is this playbook unlocked for me?" — so it gets its own covering index.
CREATE INDEX IF NOT EXISTS qa_playbook_collection_items_access_idx
  ON qa_playbook_collection_items (playbook_id, collection_id);
