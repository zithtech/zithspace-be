-- QA Playbooks — "write us a playbook for this" requests.
--
-- WHY A SECOND REQUEST TABLE:
--   qa_playbook_unlock_requests answers "let my workspace read THIS playbook".
--   This one answers "there is no playbook for what we build — please write
--   one". They share nothing: an unlock request points at a row that exists and
--   is decided by granting access, while this one is a piece of demand with no
--   playbook behind it yet, decided by someone at Testiez authoring it.
--   Folding both into one table would mean playbook_id NULL for half the rows
--   and a status vocabulary that means two different things.
--
-- LIFECYCLE (status):
--   pending    asked for, nobody has looked yet
--   planned    accepted, on the list to write
--   published  written — playbook_id points at what shipped for it
--   declined   not something the library will cover, decision_note says why
--
-- OWNERSHIP: tenant_id is the workspace that asked. Rows are read back by that
-- workspace (their own asks) and by a super_admin (every ask, to work from).

CREATE TABLE IF NOT EXISTS qa_playbook_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  requested_by  UUID,
  -- The feature they want covered, e.g. "Bulk import from CSV".
  title         TEXT NOT NULL,
  -- Where they would file it, free text: the catalog's categories are not a
  -- closed set, and a request is exactly the case where a new one appears.
  category      TEXT,
  -- What their flow looks like, what worries them about it.
  details       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  -- Set when the request is answered with a real playbook.
  playbook_id   UUID REFERENCES qa_playbooks(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qa_playbook_requests DROP CONSTRAINT IF EXISTS qa_playbook_requests_status_chk;
ALTER TABLE qa_playbook_requests ADD CONSTRAINT qa_playbook_requests_status_chk
  CHECK (status IN ('pending', 'planned', 'published', 'declined'));

-- One open ask per workspace per subject. Someone clicking twice, or two QAs on
-- the same team asking for the same thing, must not put two rows in front of an
-- admin. lower(title) so "Bulk import" and "bulk import" are the same ask.
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_requests_open_uidx
  ON qa_playbook_requests (tenant_id, lower(title))
  WHERE status IN ('pending', 'planned');

CREATE INDEX IF NOT EXISTS qa_playbook_requests_status_idx
  ON qa_playbook_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS qa_playbook_requests_tenant_idx
  ON qa_playbook_requests (tenant_id, created_at DESC);
