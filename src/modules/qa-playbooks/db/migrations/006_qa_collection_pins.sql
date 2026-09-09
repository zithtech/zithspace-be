-- QA Playbooks — "what do you build?", remembered.
--
-- THE PROBLEM: the library is the same 300 playbooks for everybody, and a QA
-- opening it on day one has no way to tell which of them are theirs. Migration
-- 005 built the shelf that can answer that; this is the workspace SAYING which
-- shelf is its own, once, so every later visit starts from the answer.
--
-- WHY A TABLE AND NOT A SETTINGS COLUMN:
--   A workspace picks SEVERAL — a fintech company that also ships a mobile app
--   wants both packs, plus Launch Readiness while it is pre-release. A JSON
--   column would have made "which workspaces pinned Fintech?" — the question
--   that tells Testiez what to curate next — unanswerable without scanning.
--
-- OWNERSHIP: purely per-tenant. A pin is a workspace's own note about itself,
-- never visible to another and never to Testiez's curation surfaces as anything
-- other than an aggregate.
--
-- DELIBERATELY NOT AN ACCESS RULE. A pin reorders the shelf; it does not gate
-- it. A workspace that pinned Fintech can still open E-commerce, because the
-- day they add a storefront they must not have to find a setting first.

CREATE TABLE IF NOT EXISTS qa_playbook_collection_pins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  collection_id UUID NOT NULL REFERENCES qa_playbook_collections(id) ON DELETE CASCADE,
  -- Order the workspace put them in. Their first answer is the one they look
  -- at most, so the shelf keeps it first rather than re-sorting alphabetically.
  sort_order    INTEGER NOT NULL DEFAULT 0,
  pinned_by     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_collection_pins_uidx
  ON qa_playbook_collection_pins (tenant_id, collection_id);
CREATE INDEX IF NOT EXISTS qa_playbook_collection_pins_tenant_idx
  ON qa_playbook_collection_pins (tenant_id, sort_order);
-- "How many workspaces pinned this?" — the demand signal that says which pack
-- is worth curating next.
CREATE INDEX IF NOT EXISTS qa_playbook_collection_pins_collection_idx
  ON qa_playbook_collection_pins (collection_id);
