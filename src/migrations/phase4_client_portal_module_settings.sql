-- =============================================================================
-- Client Portal — Phase 4 (Per-client module / page visibility)
--
-- Lets staff toggle which portal pages a given client can see (Invoices,
-- Sprints, Tickets, …). Opt-out model: the ABSENCE of a row means the module
-- is enabled. A row with enabled = false hides that page from the client's
-- portal nav AND blocks the underlying API (see portalModuleGate middleware).
--
-- `module_key` matches the portal route slug (invoices, sprints, mom, …) so
-- the same key drives the admin toggle, the /auth/me payload, and the gate.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_portal_module_settings (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL,
  client_id   TEXT NOT NULL,
  module_key  VARCHAR(40) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_by_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_portal_module_settings_unique
    UNIQUE (tenant_id, client_id, module_key)
);

CREATE INDEX IF NOT EXISTS client_portal_module_settings_client_idx
  ON client_portal_module_settings (tenant_id, client_id);
