-- Modules replace collections as the way the API catalog is grouped.
--
-- Everything else in QA Space is filed under a *module* — the list a workspace
-- curates in QA Space → Settings → Modules. Bugs, test scopes and test cases
-- all use it; the API catalog invented its own "collection" instead, so the
-- same area of the product had two names in two screens.
--
-- The shape after this migration:
--
--   Project ─┬─ Source (tier: local / staging / prod, tenant-wide)
--            └─ Module (qa_todo_modules.module_name) ── API definition
--
-- A module is stored as its NAME, not a foreign key. That is deliberate and
-- matches the rest of QA Space: `qa_todo_modules` rows come and go as settings
-- are edited, and a definition must not lose its filing when one is renamed or
-- re-created. The dropdown offers the curated list; a name no longer in it is
-- still shown so old values read back rather than silently emptying.

ALTER TABLE yapiez_apis ADD COLUMN IF NOT EXISTS module_name TEXT;
CREATE INDEX IF NOT EXISTS yapiez_apis_module_idx
  ON yapiez_apis (tenant_id, project_id, module_name);

-- ─── The tier becomes the definition's own column ───────────────────────────
--
-- Until now an API had no source of its own: its tier was read through its
-- collection (`yapiez_collections.source_id`). With collections gone from the
-- authoring screen there is nothing left to read it through, so the column
-- moves onto the definition where the author actually sets it.
ALTER TABLE yapiez_apis
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES yapiez_sources(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS yapiez_apis_source_idx ON yapiez_apis (tenant_id, source_id);

-- Backfill the tier from the collection that used to carry it, so every
-- existing definition keeps the tier it is already filed under.
UPDATE yapiez_apis a
   SET source_id = col.source_id
  FROM yapiez_collections col
 WHERE a.collection_id = col.id
   AND a.tenant_id = col.tenant_id
   AND a.source_id IS NULL
   AND col.source_id IS NOT NULL;

-- Backfill the module from the collection name. A collection and a module are
-- the same idea under two names ("Users", "Billing", "Auth"), so the existing
-- grouping carries over intact instead of every definition landing unfiled.
-- The name is taken as-is even when no `qa_todo_modules` row matches it: the
-- catalog shows unknown names rather than dropping them, and a workspace can
-- adopt them into Settings → Modules afterwards.
UPDATE yapiez_apis a
   SET module_name = col.name
  FROM yapiez_collections col
 WHERE a.collection_id = col.id
   AND a.tenant_id = col.tenant_id
   AND a.module_name IS NULL;

-- Where a module of that name already exists for the project, adopt its exact
-- spelling so the value matches the dropdown rather than sitting beside it as
-- a near-duplicate ("billing" vs "Billing").
UPDATE yapiez_apis a
   SET module_name = m.module_name
  FROM qa_todo_modules m
 WHERE m.tenant_id = a.tenant_id
   AND a.module_name IS NOT NULL
   AND a.module_name <> m.module_name
   AND LOWER(TRIM(a.module_name)) = LOWER(TRIM(m.module_name))
   AND (m.project_id IS NULL OR m.project_id = a.project_id);
