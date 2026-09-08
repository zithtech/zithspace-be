-- QA Playbooks — remove the seeded collection shells nobody used.
--
-- WHAT MIGRATION 005 GOT WRONG. It seeded nine empty draft collections —
-- Fintech & Payments, E-commerce & Marketplace, Launch Readiness and so on — as
-- a starting point for curation. The intent was to give a curator somewhere to
-- put things. The effect was a shelf, a catalog rail and a pin chooser all
-- listing packs that had never been curated and might never be, so the two or
-- three real collections sat among eight placeholders that looked identical to
-- them.
--
-- THEY ARE ALSO NOW REDUNDANT. Migration 010 split the industry out of the name
-- and put it behind a picker that already offers exactly these labels — Fintech
-- & Payments, E-commerce & Marketplace, Healthcare & Patient Data. The
-- vocabulary lives in that list, where it costs nothing until someone uses it.
-- A row in this table should mean "somebody made this pack", not "somebody
-- might one day".
--
-- THE RULE, and why it is safe:
--
--   created_by IS NULL   nothing but a migration wrote it. Everything authored
--                        through the app carries the id of whoever created it.
--   no members           and nobody has curated it since.
--
-- Both together is precisely "a shell from the seed that was never used". A
-- seeded collection someone HAS filled in — School & College Management,
-- Quality Analyst Things — fails the second test and stays, along with every
-- collection anyone created by hand, filled or not.
--
-- Nothing is lost: these rows held no membership, no description and no
-- pricing. Re-creating one is the New collection form with its industry picked
-- from the list.

DELETE FROM qa_playbook_collections c
 WHERE c.created_by IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM qa_playbook_collection_items i WHERE i.collection_id = c.id
   );
