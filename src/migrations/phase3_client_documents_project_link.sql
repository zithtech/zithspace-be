-- =============================================================================
-- Client Portal — Phase 3 (Documents → Project linkage)
-- Adds an optional project association to client documents so the portal can
-- filter "all documents in this project" and tag uploads against a project.
-- Nullable on purpose: legacy docs and client-side uploads may not know a
-- project at upload time, and a doc may apply to all projects for the client.
-- =============================================================================

ALTER TABLE client_documents_v2
  ADD COLUMN IF NOT EXISTS project_id TEXT;

-- Index on (tenant_id, client_id, project_id) — matches portal queries that
-- always carry tenant + client and frequently filter by project.
CREATE INDEX IF NOT EXISTS client_documents_v2_project_idx
  ON client_documents_v2 (tenant_id, client_id, project_id);
