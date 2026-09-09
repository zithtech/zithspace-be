-- QA Playbooks — a category is not a collection.
--
-- WHAT MIGRATION 008 GOT WRONG. It turned every playbook category into a
-- collection of kind 'topic', so "Authentication" and "QA Space" appeared on
-- the Collections shelf beside "Fintech & Payments". That put the same content
-- under both views of the catalog and made the Collections/Categories toggle
-- meaningless: whichever you picked, you saw Authentication.
--
-- The two views answer different questions and must not share vocabulary:
--
--   Categories   "what part of an app is this about?"  — a property of the
--                playbook, one per playbook, and `qa_playbooks.category` has
--                always been where it lives. The categories view renders
--                straight from that column and never needed a collection.
--
--   Collections  "who is this for?"  — an editorial bundle, many-to-many,
--                curated by a person. Nothing derives it automatically.
--
-- WHAT SURVIVES, and it is the part that mattered: the CROSS-MAPPINGS 008
-- created. Authentication's playbooks are members of School & College
-- Management, and QA Space's are members of Quality Analyst Things. Those are
-- rows on the target collections and are untouched by the delete below — after
-- this migration all 15 library playbooks are still in a real collection, and
-- none is orphaned.
--
-- REVERSIBLE. These rows were derived mechanically from `category`, which is
-- still there, so 008's DO block would rebuild them exactly.

-- Membership rows cascade with the collection, and only the topic collections'
-- own rows go — a playbook's place in School & College Management is a row on
-- THAT collection and is not touched.
DELETE FROM qa_playbook_collections
 WHERE tenant_id IS NULL AND kind = 'topic';

-- With the rows gone, close the door: nothing should be able to create a
-- collection that restates a category again.
ALTER TABLE qa_playbook_collections DROP CONSTRAINT IF EXISTS qa_playbook_collections_kind_chk;
ALTER TABLE qa_playbook_collections ADD CONSTRAINT qa_playbook_collections_kind_chk
  CHECK (kind IN ('industry', 'compliance', 'platform', 'stage', 'curated'));
