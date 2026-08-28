-- Modules become the parent OF collections, not a replacement for them.
--
-- Migration 004 treated the two as the same idea under different names and
-- filled an API's module from its collection's NAME. That was wrong: they are
-- two levels of one tree, and both are wanted.
--
-- The shape after this migration:
--
--   Project ─┬─ Source (tier: local / staging / prod, tenant-wide)
--            └─ Module ── Collection ── API definition
--
-- Module comes from QA Space → Settings → Modules — the taxonomy bugs, scopes
-- and test cases already share. A collection groups related endpoints inside
-- one module; an API sits inside a collection, or directly under a module when
-- it has not been grouped yet.
--
-- `yapiez_apis.module_name` stays on the definition rather than being read
-- through its collection, because an API filed under no collection still
-- belongs to a module. Where an API HAS a collection, the two agree — the
-- writes below keep them in step.

ALTER TABLE yapiez_collections ADD COLUMN IF NOT EXISTS module_name TEXT;
CREATE INDEX IF NOT EXISTS yapiez_collections_module_idx
  ON yapiez_collections (tenant_id, project_id, module_name);

-- ─── Undoing 004's conflation ───────────────────────────────────────────────
--
-- Where the name 004 copied onto an API is one the workspace genuinely curates
-- as a module, it stands, and the collection is adopted into that module.
UPDATE yapiez_collections col
   SET module_name = m.module_name
  FROM qa_todo_modules m
 WHERE m.tenant_id = col.tenant_id
   AND col.module_name IS NULL
   AND LOWER(TRIM(m.module_name)) = LOWER(TRIM(col.name))
   AND (m.project_id IS NULL OR m.project_id = col.project_id);

-- Where it is NOT a curated module, that value was only ever the collection's
-- own name. The collection still carries it; the API's module is genuinely
-- unset, and saying so beats inventing a module nobody created.
UPDATE yapiez_apis a
   SET module_name = NULL
  FROM yapiez_collections col
 WHERE col.id = a.collection_id
   AND col.tenant_id = a.tenant_id
   AND a.module_name IS NOT NULL
   AND LOWER(TRIM(a.module_name)) = LOWER(TRIM(col.name))
   AND NOT EXISTS (
     SELECT 1
       FROM qa_todo_modules m
      WHERE m.tenant_id = a.tenant_id
        AND LOWER(TRIM(m.module_name)) = LOWER(TRIM(a.module_name))
        AND (m.project_id IS NULL OR m.project_id = a.project_id)
   );

-- An API inside a collection belongs to that collection's module. Stamping it
-- here is what lets the catalog group by module without a join on every read.
UPDATE yapiez_apis a
   SET module_name = col.module_name
  FROM yapiez_collections col
 WHERE col.id = a.collection_id
   AND col.tenant_id = a.tenant_id
   AND col.module_name IS NOT NULL
   AND a.module_name IS DISTINCT FROM col.module_name;

-- ─── Collection names are unique within their module too ────────────────────
--
-- "Users" is a legitimate collection name under Billing and under Auth alike,
-- so the module joins the key. COALESCE throughout because Postgres treats
-- NULLs as distinct in a unique index — an unfiled collection would otherwise
-- escape the constraint entirely.
DROP INDEX IF EXISTS yapiez_collections_scope_name_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_collections_module_name_uidx
  ON yapiez_collections (
    tenant_id,
    COALESCE(project_id, ''),
    LOWER(COALESCE(module_name, '')),
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
    LOWER(name)
  );
