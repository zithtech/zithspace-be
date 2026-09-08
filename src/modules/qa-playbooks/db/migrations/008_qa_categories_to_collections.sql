-- QA Playbooks — categories become collections.
--
-- WHY: `qa_playbooks.category` is a single free-text field, so a playbook has
-- exactly one. That was always the limitation collections were built to remove
-- — 'Login' belongs to Authentication AND to School Management AND to whatever
-- else ships a login — and until now the two lived side by side with the old
-- one-home model still holding the content.
--
-- This migration makes the category a FIRST-CLASS collection so it can be
-- composed: every distinct library category becomes a collection of kind
-- 'topic', holding exactly the playbooks that carried it.
--
-- `category` IS NOT DROPPED, and that is deliberate. It still drives the
-- catalog's "show as categories" view, the author form, and the API's filter.
-- Collections are now the DEFAULT way to browse; categories remain the way a
-- playbook says what it is about. Removing the column would have made this a
-- rewrite of the authoring surface rather than an addition to the browsing one.
--
-- A NEW KIND, 'topic'. Fintech is an industry, PCI-DSS is a standard, and
-- Authentication is neither — it is what a playbook COVERS. Folding it into
-- 'curated' would have put an automatically-derived shelf under a heading that
-- means "somebody chose this".

ALTER TABLE qa_playbook_collections DROP CONSTRAINT IF EXISTS qa_playbook_collections_kind_chk;
ALTER TABLE qa_playbook_collections ADD CONSTRAINT qa_playbook_collections_kind_chk
  CHECK (kind IN ('industry', 'compliance', 'platform', 'stage', 'curated', 'topic'));

-- ─── One collection per library category ────────────────────────────────────
-- Data-driven rather than a hardcoded list: whatever categories the library
-- holds when this runs are the ones that get a shelf. Published, because these
-- mirror what the category rail already shows — this migration changes how the
-- library is browsed, not who may see it.
--
-- Membership is ordered by name. There is no editorial order to inherit — the
-- category never had one — and alphabetical is the only ordering a reader can
-- predict. A curator can drag them into a better one afterwards.
DO $$
DECLARE
  cat        RECORD;
  target_id  UUID;
  target_slug TEXT;
  shelf_pos  INT := 200;   -- after the seeded industry and compliance packs
BEGIN
  FOR cat IN
    SELECT DISTINCT category FROM qa_playbooks WHERE tenant_id IS NULL ORDER BY category
  LOOP
    target_slug := trim(BOTH '-' FROM regexp_replace(lower(cat.category), '[^a-z0-9]+', '-', 'g'));
    IF target_slug = '' THEN CONTINUE; END IF;

    INSERT INTO qa_playbook_collections
      (tenant_id, slug, name, kind, summary, icon, visibility, status, sort_order)
    VALUES
      (NULL, target_slug, cat.category, 'topic',
       'Everything the library covers on ' || cat.category || '.',
       'Layers', 'public', 'published', shelf_pos)
    ON CONFLICT DO NOTHING;

    SELECT id INTO target_id
      FROM qa_playbook_collections
     WHERE tenant_id IS NULL AND slug = target_slug;

    INSERT INTO qa_playbook_collection_items (collection_id, playbook_id, sort_order)
    SELECT target_id, ranked.id, ranked.pos
      FROM (
        SELECT p.id, (row_number() OVER (ORDER BY p.name))::int - 1 AS pos
          FROM qa_playbooks p
         WHERE p.tenant_id IS NULL AND p.category = cat.category
      ) ranked
    ON CONFLICT DO NOTHING;

    shelf_pos := shelf_pos + 10;
  END LOOP;
END $$;

-- ─── The pack that has no category behind it ────────────────────────────────
-- "Quality Analyst Things" is a curated pack, not a topic: it is a claim that
-- these playbooks are what a QA working on QA tooling should read, which is an
-- editorial position rather than a property of the content.
INSERT INTO qa_playbook_collections
  (tenant_id, slug, name, kind, summary, icon, visibility, status, sort_order)
VALUES
  (NULL, 'quality-analyst-things', 'Quality Analyst Things', 'curated',
   'The testing a QA team needs on its own tooling — scope, cases, runs and everything around them.',
   'ShieldCheck', 'public', 'published', 5)
ON CONFLICT DO NOTHING;

-- ─── Cross-mapping: one category, several collections ───────────────────────
-- THE POINT OF THE WHOLE FEATURE, demonstrated on real content. Authentication
-- is its own topic AND part of School & College Management, because a school
-- system has logins and the people buying that pack should not have to know
-- that "Authentication" is where they live. The playbooks are not copied — the
-- same rows are members of both shelves, in a different position in each.
--
-- Appended after whatever the collection already holds, so a seeded pack that
-- someone has already curated keeps its own order at the top.
DO $$
DECLARE
  m         RECORD;
  target_id UUID;
  base      INT;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('Authentication', 'school-college-management'),
      ('QA Space',       'quality-analyst-things')
    ) AS t(category, collection_slug)
  LOOP
    SELECT id INTO target_id
      FROM qa_playbook_collections
     WHERE tenant_id IS NULL AND slug = m.collection_slug;
    IF target_id IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(MAX(sort_order) + 1, 0) INTO base
      FROM qa_playbook_collection_items WHERE collection_id = target_id;

    INSERT INTO qa_playbook_collection_items (collection_id, playbook_id, sort_order)
    SELECT target_id, ranked.id, base + ranked.pos
      FROM (
        SELECT p.id, (row_number() OVER (ORDER BY p.name))::int - 1 AS pos
          FROM qa_playbooks p
         WHERE p.tenant_id IS NULL AND p.category = m.category
      ) ranked
    ON CONFLICT DO NOTHING;

    -- A pack with content in it is a pack worth showing. The empty-collection
    -- guard the API applies on publish is satisfied by the rows just inserted.
    UPDATE qa_playbook_collections
       SET status = 'published', updated_at = NOW()
     WHERE id = target_id;
  END LOOP;
END $$;
