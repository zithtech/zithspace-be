-- =============================================================================
-- Client Portal — Phase 3 (Milestones / Delivery Tracker)
--
-- A milestone is a delivery-grade checkpoint (e.g. "Landing page", "Auth").
-- Each milestone has a breakdown of items (frontend, backend, integration…)
-- that the staff tick off. When every item is done the milestone flips to
-- `completed` and we stamp `actual_end_date`. The portal renders this
-- read-only so the client can see progress.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_milestones (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  project_id      TEXT,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  status          VARCHAR(30) NOT NULL DEFAULT 'not_started',
  est_start_date  DATE,
  est_end_date    DATE,
  actual_end_date DATE,
  position        INTEGER NOT NULL DEFAULT 0,
  created_by_id   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_milestones_status_check
    CHECK (status IN ('not_started','in_progress','completed','on_hold','cancelled'))
);

CREATE INDEX IF NOT EXISTS client_milestones_client_idx
  ON client_milestones (tenant_id, client_id, position ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS client_milestones_status_idx
  ON client_milestones (tenant_id, status);
CREATE INDEX IF NOT EXISTS client_milestones_project_idx
  ON client_milestones (tenant_id, project_id);

CREATE TABLE IF NOT EXISTS client_milestone_items (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  milestone_id    TEXT NOT NULL REFERENCES client_milestones(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  is_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  completed_by_id TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_milestone_items_milestone_idx
  ON client_milestone_items (tenant_id, milestone_id, position ASC, created_at ASC);
