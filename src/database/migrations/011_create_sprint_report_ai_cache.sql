-- Sprint report AI narrative cache.
-- One row per (tenant, sprint). Regenerating overwrites the row.

CREATE TABLE IF NOT EXISTS sprint_report_ai_narratives (
  tenant_id        TEXT NOT NULL,
  sprint_id        TEXT NOT NULL,
  narrative        JSONB NOT NULL,
  predictions      JSONB,
  model            TEXT NOT NULL,
  generated_by_id  TEXT,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context_hash     TEXT,
  PRIMARY KEY (tenant_id, sprint_id)
);

CREATE INDEX IF NOT EXISTS sprint_report_ai_narratives_sprint_idx
  ON sprint_report_ai_narratives (sprint_id);
