-- Yapiez Sources — the deployment tier a set of API definitions describes.
--
-- The catalog is now three levels:
--
--   Source (local / staging / beta / prod)
--     └─ Collection (Users, Billing, Auth)
--          └─ API definition
--
-- A Source is NOT an Environment, despite the overlapping vocabulary:
--   Environment  a RUN target — base URL, credentials, variables. Chosen when
--                a flow executes, and carries secrets.
--   Source       a CATALOGUE label — which tier these definitions describe.
--                Carries nothing executable and is never resolved at run time.
-- The same flow can run a "staging" collection against any environment; that
-- is deliberate, and why the two are not merged.

CREATE TABLE IF NOT EXISTS yapiez_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  -- Stable machine name (local, staging, …). The label is what people read, so
  -- renaming a source never breaks anything that referenced its key.
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  color         TEXT,
  sort          INTEGER NOT NULL DEFAULT 0,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yapiez_sources_tenant_idx ON yapiez_sources (tenant_id, sort);
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_sources_key_uidx
  ON yapiez_sources (tenant_id, lower(key));
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_sources_label_uidx
  ON yapiez_sources (tenant_id, lower(label));

ALTER TABLE yapiez_collections
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES yapiez_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS yapiez_collections_source_idx
  ON yapiez_collections (tenant_id, source_id);

-- Collection names are now unique WITHIN a source, not across the tenant: the
-- whole point of the tier is that "Users" can exist under both staging and
-- prod. Postgres treats NULLs as distinct in a unique index, so an unfiled
-- collection would escape the constraint entirely — COALESCE to a fixed
-- sentinel so unfiled collections are still checked against each other.
DROP INDEX IF EXISTS yapiez_collections_name_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_collections_source_name_uidx
  ON yapiez_collections (
    tenant_id,
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

DROP TRIGGER IF EXISTS yapiez_sources_updated_at ON yapiez_sources;
CREATE TRIGGER yapiez_sources_updated_at
  BEFORE UPDATE ON yapiez_sources
  FOR EACH ROW EXECUTE FUNCTION yapiez_set_updated_at();
