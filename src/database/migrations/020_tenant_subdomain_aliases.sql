-- ============================================================================
-- Retired subdomains, so a renamed workspace does not break its own links.
--
-- Naming a workspace changes tenants.subdomain. Everything already published
-- with the old slug then points nowhere: most visibly the signup welcome email,
-- which is sent BEFORE setup and carries the pre-rename host, but equally any
-- bookmark, invite or shared link created in between.
--
-- Rather than stop renaming (the company name genuinely may differ from
-- whatever was typed at signup), keep the old slug resolvable and redirect it
-- to the current one.
--
-- NO ROW-LEVEL SECURITY HERE, deliberately. This table is read to work out
-- WHICH tenant a request belongs to, before any tenant context exists — an RLS
-- policy keyed on app.current_tenant_id could never match, and lookups would
-- silently return nothing. Same reasoning as `tenants` itself, which is also
-- unprotected. Nothing here is sensitive: a slug is public the moment it is a
-- hostname.
--
-- tenant_id is TEXT, not uuid: tenants.id is text and holds non-uuid values
-- such as 'GLOBAL'.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_subdomain_aliases (
  -- The retired slug. PRIMARY KEY because one slug can only ever point at one
  -- tenant — that is exactly the guarantee that makes redirecting safe.
  subdomain  text        PRIMARY KEY,
  tenant_id  text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- "What did this workspace used to be called?" — for support, and for cleaning
-- up aliases when a tenant renames back to a slug it previously held.
CREATE INDEX IF NOT EXISTS tenant_subdomain_aliases_tenant_idx
  ON tenant_subdomain_aliases (tenant_id);

COMMENT ON TABLE tenant_subdomain_aliases IS
  'Subdomains a tenant used to own. Resolved as a fallback after tenants.subdomain and redirected to the current slug. Also reserved: a retired slug must never be handed to a different tenant, or old links would silently land on someone else''s workspace.';

COMMIT;

-- ============================================================================
-- VERIFY
--
--   SELECT a.subdomain AS old, t.subdomain AS current, t.name
--     FROM tenant_subdomain_aliases a
--     JOIN tenants t ON t.id = a.tenant_id;
-- ============================================================================
