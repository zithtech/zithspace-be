-- =============================================================================
-- Client Portal — Phase 3 (Environments / Deployments)
--
-- Two-table module:
--   portal_environments — one row per environment per project (Prod, Staging,
--     UAT, etc) with URL, current version, status, SSL expiry, last backup.
--   portal_deployments  — history of deploys against an environment, with
--     optional cross-link to a `release_notes` row.
--
-- Status, uptime %, SSL expiry and backup status are all staff-maintained
-- fields in this iteration — no scheduled health checks yet. The UI
-- color-codes SSL based on days until expiry.
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_environments (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                TEXT NOT NULL,
  client_id                TEXT NOT NULL,
  project_id               TEXT,
  name                     VARCHAR(120) NOT NULL,
  kind                     VARCHAR(30) NOT NULL DEFAULT 'production',
  url                      TEXT,
  status                   VARCHAR(20) NOT NULL DEFAULT 'operational',
  current_version          VARCHAR(60),
  ssl_expires_at           DATE,
  last_backup_at           TIMESTAMPTZ,
  last_health_check_at     TIMESTAMPTZ,
  uptime_percent           DECIMAL(5, 2),
  notes                    TEXT,
  visibility               VARCHAR(20) NOT NULL DEFAULT 'client',
  position                 INTEGER NOT NULL DEFAULT 0,
  created_by_user_id       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_environments_kind_check
    CHECK (kind IN ('production','staging','uat','qa','dev','demo','preview','other')),
  CONSTRAINT portal_environments_status_check
    CHECK (status IN ('operational','degraded','down','maintenance','unknown')),
  CONSTRAINT portal_environments_visibility_check
    CHECK (visibility IN ('client','internal'))
);

CREATE INDEX IF NOT EXISTS portal_environments_client_idx
  ON portal_environments (tenant_id, client_id, position ASC);
CREATE INDEX IF NOT EXISTS portal_environments_project_idx
  ON portal_environments (tenant_id, project_id);

CREATE TABLE IF NOT EXISTS portal_deployments (
  id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                 TEXT NOT NULL,
  environment_id            TEXT NOT NULL REFERENCES portal_environments(id) ON DELETE CASCADE,
  client_id                 TEXT NOT NULL,
  project_id                TEXT,
  version                   VARCHAR(60) NOT NULL,
  status                    VARCHAR(20) NOT NULL DEFAULT 'success',
  started_at                TIMESTAMPTZ,
  finished_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds          INTEGER,
  release_note_id           UUID,
  deployed_by               VARCHAR(200),
  deployed_by_user_id       TEXT,
  changelog_excerpt         TEXT,
  rollback_of_deployment_id TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_deployments_status_check
    CHECK (status IN ('success','failed','rolled_back','in_progress'))
);

CREATE INDEX IF NOT EXISTS portal_deployments_env_idx
  ON portal_deployments (tenant_id, environment_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS portal_deployments_client_idx
  ON portal_deployments (tenant_id, client_id, finished_at DESC);
