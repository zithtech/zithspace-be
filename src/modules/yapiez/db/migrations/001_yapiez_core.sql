-- Yapiez — the API definition + flow execution layer that feeds QA Space.
--
-- Shape of the module, in the order the tables below appear:
--
--   Collection ─┬─> API definition (what developers publish, once)
--               │
--   Environment ┴─> Flow ──> Flow Step (QA's ordered reuse of those APIs)
--                     │
--                     └──> Flow Run ──> Flow Run Step (one execution, kept)
--
-- Types are chosen to match the tables Yapiez joins to, which are NOT uniform
-- across this database:
--   tenant_id / scope_id   UUID  — matches qa_test_scopes, qa_submissions
--   project_id / bug_id    TEXT  — matches projects, bugs (Prisma-era ids)
-- Getting this wrong produces a FK that will not create, so do not "tidy" it.

-- ─── Collections: how a tenant files its API catalog ────────────────────────
CREATE TABLE IF NOT EXISTS yapiez_collections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  project_id    TEXT,
  color         TEXT,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yapiez_collections_tenant_idx ON yapiez_collections (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_collections_name_uidx
  ON yapiez_collections (tenant_id, lower(name));

-- ─── API definitions: the developer-owned contract ──────────────────────────
-- Everything a step needs to execute the call lives here, so a Flow Step can
-- stay a thin reference plus per-step overrides.
CREATE TABLE IF NOT EXISTS yapiez_apis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  collection_id     UUID REFERENCES yapiez_collections(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  method            TEXT NOT NULL,          -- GET | POST | PUT | PATCH | DELETE
  url               TEXT NOT NULL,          -- may be relative; {{baseUrl}} is prepended
  -- Header / param sets are stored as arrays of {key, value, description, enabled,
  -- required, secret} rather than plain objects, so the UI can round-trip
  -- disabled-but-documented entries and keep author order.
  headers           JSONB NOT NULL DEFAULT '[]'::jsonb,
  query_params      JSONB NOT NULL DEFAULT '[]'::jsonb,
  path_params       JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_type         TEXT NOT NULL DEFAULT 'none',  -- none | json | form | text
  request_body      TEXT,
  sample_data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  auth_type         TEXT NOT NULL DEFAULT 'inherit', -- inherit | none | bearer | basic | api_key
  auth_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_status   INTEGER,
  expected_response TEXT,
  response_schema   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Assertions authored by the developer travel with the definition; a step
  -- inherits them unless it declares its own (see yapiez_flow_steps.assertions).
  default_assertions JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeout_ms        INTEGER,
  tags              TEXT[] NOT NULL DEFAULT '{}'::text[],
  owner_id          UUID,
  notes             TEXT,
  is_deprecated     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yapiez_apis_tenant_idx ON yapiez_apis (tenant_id);
CREATE INDEX IF NOT EXISTS yapiez_apis_collection_idx ON yapiez_apis (tenant_id, collection_id);
CREATE INDEX IF NOT EXISTS yapiez_apis_method_idx ON yapiez_apis (tenant_id, method);

-- ─── Environments: where a flow runs, and the values it starts with ─────────
-- `variables` is [{key, value, secret}]. Secret values are never returned to
-- the client and never written into a run's saved variable snapshot.
CREATE TABLE IF NOT EXISTS yapiez_environments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          TEXT NOT NULL,
  base_url      TEXT NOT NULL,
  description   TEXT,
  variables     JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yapiez_environments_tenant_idx ON yapiez_environments (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS yapiez_environments_name_uidx
  ON yapiez_environments (tenant_id, lower(name));

-- ─── Flows: QA's reusable, ordered composition of APIs ──────────────────────
-- scope_id is the join into QA Space: a flow reports against a Test Scope, the
-- same way a Test Run does, so QA Submissions can cite flow evidence.
CREATE TABLE IF NOT EXISTS yapiez_flows (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  scope_id          UUID REFERENCES qa_test_scopes(id) ON DELETE SET NULL,
  project_id        TEXT,
  environment_id    UUID REFERENCES yapiez_environments(id) ON DELETE SET NULL,
  -- The authentication step is modelled as a property of the flow, not as an
  -- ordinary step: every run performs it first, and QA never wires the token
  -- through by hand. auth_config carries {tokenPath, headerName, scheme,
  -- variableName, body} — see services/auth.ts for the defaults.
  auth_api_id       UUID REFERENCES yapiez_apis(id) ON DELETE SET NULL,
  auth_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  stop_on_failure   BOOLEAN NOT NULL DEFAULT TRUE,
  status            TEXT NOT NULL DEFAULT 'Active',   -- Active | Draft | Archived
  tags              TEXT[] NOT NULL DEFAULT '{}'::text[],
  last_run_id       UUID,
  last_run_status   TEXT,
  last_run_at       TIMESTAMPTZ,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yapiez_flows_tenant_idx ON yapiez_flows (tenant_id);
CREATE INDEX IF NOT EXISTS yapiez_flows_scope_idx ON yapiez_flows (tenant_id, scope_id);
CREATE INDEX IF NOT EXISTS yapiez_flows_project_idx ON yapiez_flows (tenant_id, project_id);

-- ─── Flow steps: one API in the chain ───────────────────────────────────────
-- `extractions` is [{variable, source, path}] — what this step contributes to
-- the run's variable context (e.g. userId <- body.id).
-- `assertions` is [{type, path, operator, expected}]; empty means "inherit the
-- API's default_assertions".
CREATE TABLE IF NOT EXISTS yapiez_flow_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  flow_id             UUID NOT NULL REFERENCES yapiez_flows(id) ON DELETE CASCADE,
  api_id              UUID NOT NULL REFERENCES yapiez_apis(id) ON DELETE RESTRICT,
  position            INTEGER NOT NULL DEFAULT 0,
  step_name           TEXT,
  description         TEXT,
  overrides           JSONB NOT NULL DEFAULT '{}'::jsonb,
  extractions         JSONB NOT NULL DEFAULT '[]'::jsonb,
  assertions          JSONB NOT NULL DEFAULT '[]'::jsonb,
  continue_on_failure BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  delay_ms            INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yapiez_flow_steps_flow_idx ON yapiez_flow_steps (flow_id, position);

-- ─── Flow runs: one execution, kept as QA evidence ──────────────────────────
CREATE TABLE IF NOT EXISTS yapiez_flow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  flow_id         UUID NOT NULL REFERENCES yapiez_flows(id) ON DELETE CASCADE,
  environment_id  UUID REFERENCES yapiez_environments(id) ON DELETE SET NULL,
  scope_id        UUID REFERENCES qa_test_scopes(id) ON DELETE SET NULL,
  run_number      INTEGER NOT NULL DEFAULT 1,
  run_name        TEXT,
  status          TEXT NOT NULL DEFAULT 'Running', -- Running | Passed | Failed | Aborted
  trigger_source  TEXT NOT NULL DEFAULT 'manual',  -- manual | scope | api
  total_steps     INTEGER NOT NULL DEFAULT 0,
  passed_steps    INTEGER NOT NULL DEFAULT 0,
  failed_steps    INTEGER NOT NULL DEFAULT 0,
  skipped_steps   INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER,
  -- Snapshot of the variable context at the end of the run, secrets masked.
  -- This is what makes a failed run debuggable a week later.
  variables       JSONB NOT NULL DEFAULT '{}'::jsonb,
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  triggered_by    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yapiez_flow_runs_flow_idx ON yapiez_flow_runs (flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS yapiez_flow_runs_tenant_idx ON yapiez_flow_runs (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS yapiez_flow_runs_scope_idx ON yapiez_flow_runs (tenant_id, scope_id);

-- ─── Flow run steps: the per-API record QA actually reads ───────────────────
-- step_id is nullable and ON DELETE SET NULL on purpose: editing a flow must
-- never destroy the history of what already ran. Everything needed to read an
-- old run back is denormalised here.
CREATE TABLE IF NOT EXISTS yapiez_flow_run_steps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL,
  run_id             UUID NOT NULL REFERENCES yapiez_flow_runs(id) ON DELETE CASCADE,
  step_id            UUID REFERENCES yapiez_flow_steps(id) ON DELETE SET NULL,
  api_id             UUID REFERENCES yapiez_apis(id) ON DELETE SET NULL,
  position           INTEGER NOT NULL DEFAULT 0,
  step_name          TEXT NOT NULL,
  step_kind          TEXT NOT NULL DEFAULT 'api',  -- auth | api
  method             TEXT,
  resolved_url       TEXT,
  request_headers    JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_body       TEXT,
  status_code        INTEGER,
  response_headers   JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_body      TEXT,
  response_size      INTEGER,
  duration_ms        INTEGER,
  status             TEXT NOT NULL DEFAULT 'Skipped', -- Pass | Fail | Skipped
  assertion_results  JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted          JSONB NOT NULL DEFAULT '{}'::jsonb,
  error              TEXT,
  bug_id             TEXT REFERENCES bugs(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yapiez_flow_run_steps_run_idx ON yapiez_flow_run_steps (run_id, position);
CREATE INDEX IF NOT EXISTS yapiez_flow_run_steps_bug_idx ON yapiez_flow_run_steps (bug_id);

-- ─── updated_at maintenance ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION yapiez_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS yapiez_collections_updated_at ON yapiez_collections;
CREATE TRIGGER yapiez_collections_updated_at
  BEFORE UPDATE ON yapiez_collections
  FOR EACH ROW EXECUTE FUNCTION yapiez_set_updated_at();

DROP TRIGGER IF EXISTS yapiez_apis_updated_at ON yapiez_apis;
CREATE TRIGGER yapiez_apis_updated_at
  BEFORE UPDATE ON yapiez_apis
  FOR EACH ROW EXECUTE FUNCTION yapiez_set_updated_at();

DROP TRIGGER IF EXISTS yapiez_environments_updated_at ON yapiez_environments;
CREATE TRIGGER yapiez_environments_updated_at
  BEFORE UPDATE ON yapiez_environments
  FOR EACH ROW EXECUTE FUNCTION yapiez_set_updated_at();

DROP TRIGGER IF EXISTS yapiez_flows_updated_at ON yapiez_flows;
CREATE TRIGGER yapiez_flows_updated_at
  BEFORE UPDATE ON yapiez_flows
  FOR EACH ROW EXECUTE FUNCTION yapiez_set_updated_at();

DROP TRIGGER IF EXISTS yapiez_flow_steps_updated_at ON yapiez_flow_steps;
CREATE TRIGGER yapiez_flow_steps_updated_at
  BEFORE UPDATE ON yapiez_flow_steps
  FOR EACH ROW EXECUTE FUNCTION yapiez_set_updated_at();
