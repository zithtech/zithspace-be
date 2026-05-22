-- =============================================================================
-- Client Portal — Phase 3 (Releases)
--
-- A release is a deliverable version that ships against a milestone, e.g.
-- "v1.2.0 — Payments hardening". Each release belongs to one milestone (the
-- delivery checkpoint it ships under) and carries a rich-text description
-- (HTML produced by TipTap) plus a release date.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_project_releases (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  project_id      TEXT,
  milestone_id    TEXT REFERENCES client_milestones(id) ON DELETE SET NULL,
  title           VARCHAR(255) NOT NULL,
  version         VARCHAR(64),
  description     TEXT,
  release_date    DATE,
  created_by_id   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_project_releases_client_idx
  ON client_project_releases (tenant_id, client_id, release_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS client_project_releases_project_idx
  ON client_project_releases (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS client_project_releases_milestone_idx
  ON client_project_releases (tenant_id, milestone_id);
