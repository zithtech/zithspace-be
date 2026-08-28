-- Project scoping for the Yapiez catalog.
--
-- Everything else in QA Space is organised by project — test scopes, bug
-- folders, test runs — and the API catalog was not. A tenant running work for
-- several projects saw one undifferentiated pile of endpoints.
--
-- The shape after this migration:
--
--   Project ─┬─ Source (tier: local / staging / prod, tenant-wide)
--            └─ Collection ── API definition
--
-- Project and Source are ORTHOGONAL, not nested: "staging" means the same
-- thing in every project, so tiers stay tenant-wide while collections and
-- definitions belong to a project.
--
-- project_id is TEXT throughout, matching the Prisma-era `projects` table.
-- NULL means "shared across every project" rather than "unassigned" — that is
-- what keeps existing rows reachable instead of orphaning them.

ALTER TABLE yapiez_apis ADD COLUMN IF NOT EXISTS project_id TEXT;
CREATE INDEX IF NOT EXISTS yapiez_apis_project_idx ON yapiez_apis (tenant_id, project_id);

-- An environment can be shared (NULL) or belong to one project: a base URL is
-- usually per-application, but a shared sandbox is a real thing too.
ALTER TABLE yapiez_environments ADD COLUMN IF NOT EXISTS project_id TEXT;
CREATE INDEX IF NOT EXISTS yapiez_environments_project_idx
  ON yapiez_environments (tenant_id, project_id);

-- Backfill: an API's project is its collection's project. Definitions filed
-- before this migration keep working and land in the right place rather than
-- disappearing from every project-filtered view.
UPDATE yapiez_apis a
   SET project_id = col.project_id
  FROM yapiez_collections col
 WHERE a.collection_id = col.id
   AND a.tenant_id = col.tenant_id
   AND a.project_id IS NULL
   AND col.project_id IS NOT NULL;

-- Collection names are unique within a project AND a source: "Users" is a
-- legitimate name in every project, and in every tier of each. Both keys are
-- COALESCEd because Postgres treats NULLs as distinct in a unique index, so an
-- unassigned collection would otherwise escape the constraint entirely.
DROP INDEX IF EXISTS yapiez_collections_source_name_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_collections_scope_name_uidx
  ON yapiez_collections (
    tenant_id,
    COALESCE(project_id, ''),
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

-- Environment names are unique per project for the same reason: every project
-- wants an environment called "QA".
DROP INDEX IF EXISTS yapiez_environments_name_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_environments_scope_name_uidx
  ON yapiez_environments (tenant_id, COALESCE(project_id, ''), lower(name));
