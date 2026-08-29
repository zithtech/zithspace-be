-- Deleting from the catalog stops being permanent.
--
-- An API definition is hours of work — the headers, the sample payload, the
-- assertions QA inherits — and until now one click removed it for good. A
-- catalog people are willing to prune is one where pruning is reversible, so
-- deletes become a timestamp and everything reads past them.
--
-- Two levels can be thrown away: a definition, and a collection. A module
-- cannot, because a module is not a row here — the curated list lives in QA
-- Settings, and deleting one there only unfiles what the catalog had under it.

ALTER TABLE yapiez_apis ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE yapiez_apis ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS yapiez_apis_deleted_idx ON yapiez_apis (tenant_id, deleted_at);

ALTER TABLE yapiez_collections ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE yapiez_collections ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS yapiez_collections_deleted_idx
  ON yapiez_collections (tenant_id, deleted_at);

-- A name in the trash must not hold the name hostage.
--
-- The uniqueness rule was written when a delete removed the row: now the row
-- survives, and without this a collection called "Users" sitting in the trash
-- would refuse to let you create a new one. The index becomes partial so only
-- live collections compete for a name.
DROP INDEX IF EXISTS yapiez_collections_module_name_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_collections_module_name_uidx
  ON yapiez_collections (
    tenant_id,
    COALESCE(project_id, ''),
    LOWER(COALESCE(module_name, '')),
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
    LOWER(name)
  )
  WHERE deleted_at IS NULL;
