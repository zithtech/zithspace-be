-- Test Scenarios — the flow layer inside a module's test cases.
--
-- THE PROBLEM THIS SOLVES:
--   A module scenario ("User Management") accumulates a hundred module test
--   cases. Nothing in that flat list says which eight of them are the
--   "Create User" flow, nor in what order a tester walks them. Grouping by
--   priority or type does not answer it — the grouping is a business flow the
--   tester names themselves.
--
--   qa_parent_test_cases  ──> qa_test_cases          (the flat list, unchanged)
--            │                      ▲
--            └──> qa_test_scenarios ┘  via qa_test_scenario_cases (ordered)
--
-- WHY A JOIN TABLE, not a scenario_id column on qa_test_cases:
--   One case genuinely belongs to several flows — "Log in as admin" opens
--   Create User, Delete User and Reset Password alike. A column would force a
--   copy of the case per flow, and the copies would drift. The join table also
--   keeps this module off a table another module owns.
--
-- ORDER is `position`, per membership rather than per case, because the same
-- case is step 1 of one flow and step 4 of another.
--
-- Types match the tables this module joins to, which are NOT uniform across
-- this database: tenant_id / module_id / parent_test_case_id / test case ids
-- are all UUID on the qa_* tables. Do not "tidy" them to TEXT.

CREATE TABLE IF NOT EXISTS qa_test_scenarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,

  -- The Module Test Cases page this flow is drawn on. CASCADE: a flow has no
  -- meaning once the module scenario it groups is gone.
  parent_test_case_id UUID NOT NULL REFERENCES qa_parent_test_cases(id) ON DELETE CASCADE,
  -- Denormalised from the parent so a flow can be listed by module without a
  -- second join. Nullable — a parent may itself be unfiled.
  module_id           UUID,

  -- What the tester calls the flow: "Create User", "Password Reset".
  name                TEXT NOT NULL,
  description         TEXT,

  -- Order of the flows themselves on the page. Ties break on created_at.
  position            INTEGER NOT NULL DEFAULT 0,

  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qa_test_scenarios_parent_idx
  ON qa_test_scenarios (tenant_id, parent_test_case_id, position);

-- Two flows called "Create User" on the same page are a mistake every time,
-- and case-insensitively so — "create user" is the same flow.
CREATE UNIQUE INDEX IF NOT EXISTS qa_test_scenarios_name_uidx
  ON qa_test_scenarios (tenant_id, parent_test_case_id, LOWER(name));

-- ─── Membership: which cases the flow walks, and in what order ──────────────
CREATE TABLE IF NOT EXISTS qa_test_scenario_cases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  scenario_id  UUID NOT NULL REFERENCES qa_test_scenarios(id) ON DELETE CASCADE,
  -- Both sides cascade: a membership row describes a case that exists. Once
  -- the case is deleted there is no step left to walk.
  test_case_id UUID NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,
  -- Step number within THIS flow, 0-based. Rewritten wholesale on every
  -- reorder, so gaps never accumulate.
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A case is a step of a flow once, not twice.
CREATE UNIQUE INDEX IF NOT EXISTS qa_test_scenario_cases_uidx
  ON qa_test_scenario_cases (scenario_id, test_case_id);
CREATE INDEX IF NOT EXISTS qa_test_scenario_cases_order_idx
  ON qa_test_scenario_cases (scenario_id, position);
-- Reading a case's flows from the flat list ("which flows is this in?").
CREATE INDEX IF NOT EXISTS qa_test_scenario_cases_case_idx
  ON qa_test_scenario_cases (tenant_id, test_case_id);
