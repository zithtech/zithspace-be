-- Request payloads QA keeps against a module test case.
--
-- Why this lives in Yapiez and not in the QA test-case tables:
-- a payload is only meaningful next to the API definition it was written for.
-- It is generated FROM `yapiez_apis` (its body, its query and path params) and
-- read back beside that definition, so it belongs to the module that owns the
-- contract. The QA side of the join is a plain nullable id.
--
--   yapiez_apis ──> Case payload <── qa_test_cases
--                        │
--                     payload_type: Positive | Negative | Valid | Invalid
--
-- The four types are the whole point of the table. A tester opens a case and
-- needs the body that SHOULD work and the ones that should NOT, already
-- written down, rather than inventing each one at the keyboard:
--   Positive  fully-populated happy path, every field a realistic value
--   Valid     the minimum well-formed body the contract accepts
--   Negative  well-formed but breaks a business rule (missing record, bad range)
--   Invalid   malformed against the contract (wrong types, missing required)
--
-- test_case_id is NULLABLE on purpose. A payload is confirmed inside the New
-- Module Test Case drawer, BEFORE the case it belongs to has been saved, so it
-- lands here parented only to the scenario and is adopted by the case the
-- moment that case is written. parent_test_case_id is what keeps an orphan
-- findable in the meantime.

CREATE TABLE IF NOT EXISTS yapiez_case_payloads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,

  -- The contract this payload was generated from. SET NULL rather than CASCADE:
  -- a payload keeps its evidentiary value after the definition is retired, and
  -- the snapshot columns below are what make it still readable.
  api_id              UUID REFERENCES yapiez_apis(id) ON DELETE SET NULL,
  api_name            TEXT,
  api_method          TEXT,
  api_url             TEXT,

  -- The QA side. Both cascade — a payload has no life of its own once the case
  -- and the scenario it was written for are gone.
  test_case_id        UUID REFERENCES qa_test_cases(id) ON DELETE CASCADE,
  parent_test_case_id UUID REFERENCES qa_parent_test_cases(id) ON DELETE CASCADE,

  -- Denormalised filing, matching how the rest of the catalog is filed: the
  -- module as a NAME so a rename in QA Settings never orphans a row.
  project_id          TEXT,
  module_name         TEXT,

  payload_type        TEXT NOT NULL,
  -- What the tester reads in the list — "Create Order · Invalid". Defaulted
  -- from the API name and the type, editable before it is confirmed.
  name                TEXT NOT NULL,

  -- { body, query, pathParams } — only the parts that apply to the method.
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- What this payload should provoke: 201 for a positive, 422 for an invalid.
  expected_status     INTEGER,
  -- One line on WHY it is negative or invalid, so the tester knows what they
  -- are looking at without diffing it against the positive one.
  notes               TEXT,
  -- Whether the body came from the model or from the structural fallback.
  generated_by        TEXT NOT NULL DEFAULT 'manual',  -- ai | structure | manual

  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT yapiez_case_payloads_type_chk
    CHECK (payload_type IN ('Positive', 'Negative', 'Valid', 'Invalid'))
);

CREATE INDEX IF NOT EXISTS yapiez_case_payloads_case_idx
  ON yapiez_case_payloads (tenant_id, test_case_id);
CREATE INDEX IF NOT EXISTS yapiez_case_payloads_parent_idx
  ON yapiez_case_payloads (tenant_id, parent_test_case_id);
CREATE INDEX IF NOT EXISTS yapiez_case_payloads_api_idx
  ON yapiez_case_payloads (tenant_id, api_id);
CREATE INDEX IF NOT EXISTS yapiez_case_payloads_module_idx
  ON yapiez_case_payloads (tenant_id, project_id, module_name);

DROP TRIGGER IF EXISTS yapiez_case_payloads_updated_at ON yapiez_case_payloads;
CREATE TRIGGER yapiez_case_payloads_updated_at
  BEFORE UPDATE ON yapiez_case_payloads
  FOR EACH ROW EXECUTE FUNCTION yapiez_set_updated_at();
