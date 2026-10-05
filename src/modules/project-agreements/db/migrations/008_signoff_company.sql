-- Project Agreements — who each side signs FOR (migration 008)
--
-- The sign-off headings were derived: ours from the letterhead's company name,
-- theirs from the Client row. That is the right default and a poor rule — a
-- subsidiary, a group entity or a trading name often signs a document raised
-- on the parent's paper, and the counterparty's signing entity is frequently
-- not the name you addressed the document to.
--
-- Both stay NULL for every existing document, and the renderer falls back to
-- exactly what it derived before, so nothing already signed changes.

ALTER TABLE pa_agreements
  ADD COLUMN IF NOT EXISTS signatory_company        text,
  ADD COLUMN IF NOT EXISTS client_signatory_company text;
