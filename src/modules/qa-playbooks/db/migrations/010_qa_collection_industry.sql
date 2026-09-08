-- QA Playbooks — a collection's industry, as its own field.
--
-- WHAT THIS CORRECTS. Migration 005 made the industry the collection's NAME
-- ("Fintech & Payments") and reserved `kind` for the small closed set of ways
-- to bundle. That collapses two things that are not the same: the industry a
-- pack is FOR, and what the pack is CALLED. It left no way to have two packs
-- for one industry — "Fintech Essentials" and "Fintech Compliance" are both
-- fintech and need different names — and it forced whoever created a
-- collection to encode the industry into free text, where "Fintech",
-- "FinTech" and "Financial services" become three audiences instead of one.
--
--   name      free text. What this pack is called.
--   industry  who it is for. Chosen from a list, or added to that list.
--
-- OPEN VOCABULARY, deliberately. There is no CHECK and no lookup table: the
-- list of industries anyone might build for is not something this schema can
-- know in advance, and a closed set would send people back to putting it in
-- the name. The UI offers the common ones and lets you type a new one; this
-- column stores whatever came back.
--
-- NULLABLE, because not every collection has one. "PCI-DSS Payment Security"
-- is a standard and "Start Here" is an editorial pick — neither is for an
-- industry, and forcing a value would mean inventing one.
--
-- `kind` STAYS. It still separates an industry pack from a compliance pack
-- from an editorial one, which is what groups the shelf under its headings.
-- What changes is that it is no longer something anyone types into a form:
-- collections created through the app are industry packs, and the other kinds
-- are Testiez's own seeded rows.

ALTER TABLE qa_playbook_collections
  ADD COLUMN IF NOT EXISTS industry TEXT;

-- The seeded industry packs were named after their industry, which is exactly
-- the conflation this migration undoes — so the name is the right backfill,
-- and a curator can rename either half independently afterwards.
UPDATE qa_playbook_collections
   SET industry = name
 WHERE kind = 'industry' AND industry IS NULL;

-- "Which packs serve fintech?" — the question the column exists to answer, and
-- the one the shelf will group by.
CREATE INDEX IF NOT EXISTS qa_playbook_collections_industry_idx
  ON qa_playbook_collections (industry) WHERE industry IS NOT NULL;
