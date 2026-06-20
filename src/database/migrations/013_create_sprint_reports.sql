-- Sprint report snapshots (Sprint Reports v2).
-- A frozen, generated report per (tenant, sprint). Generated when a sprint is
-- completed, and regenerable on demand. `report_data` stores the full snapshot
-- of every report section so the detailed view loads instantly and stays frozen
-- even if the underlying tickets change later.
-- One row per (tenant, sprint). Regenerating overwrites the row.

CREATE TABLE IF NOT EXISTS sprint_reports (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  project_id        TEXT NOT NULL,
  sprint_id         TEXT NOT NULL,
  sprint_name       TEXT,
  sprint_goal       TEXT,
  status            TEXT,
  health_score      INTEGER,
  health_band       TEXT,
  completion_pct    NUMERIC,
  total_tickets     INTEGER NOT NULL DEFAULT 0,
  completed_tickets INTEGER NOT NULL DEFAULT 0,
  committed_points  INTEGER NOT NULL DEFAULT 0,
  completed_points  INTEGER NOT NULL DEFAULT 0,
  report_data       JSONB NOT NULL,
  generated_by_id   TEXT,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, sprint_id)
);

CREATE INDEX IF NOT EXISTS sprint_reports_project_idx
  ON sprint_reports (tenant_id, project_id);

CREATE INDEX IF NOT EXISTS sprint_reports_generated_at_idx
  ON sprint_reports (generated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS sprint_reports_id_idx
  ON sprint_reports (id);
