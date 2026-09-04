-- QA Playbooks — what a recommendation needs beyond "what to test".
--
-- THREE ADDITIONS, and why each one is a column rather than prose in
-- what_to_test:
--
--   preconditions  The state the system has to be in before the check means
--                  anything — "a reset token has been issued and not used".
--                  Folded into what_to_test it gets skimmed past, and a tester
--                  who skips the setup gets a result that proves nothing.
--
--   edge_cases     The variants worth a second pass — empty, maximum, unicode,
--                  concurrent, offline. Kept apart from `examples` because an
--                  example is an input WITH a verdict, while an edge case is a
--                  situation to go and look at.
--
--   references     Where this came from and where to read more. A list, not one
--                  link: a login check is answered differently by a QA tutorial,
--                  by OWASP, and by a real application to try it against, and a
--                  single "source" column forces a choice between them. Each
--                  entry is {type, name, description, url} — type is the closed
--                  vocabulary in constants.ts (qa_guide, security_standard,
--                  real_test_cases, real_application, tutorial, standard).
--
-- All three default to empty, so every row that exists keeps working untouched.

ALTER TABLE qa_playbook_items
  ADD COLUMN IF NOT EXISTS preconditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS edge_cases    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "references"  JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Each must be a JSON array — a bare object or string here would break every
-- reader that maps over them.
ALTER TABLE qa_playbook_items DROP CONSTRAINT IF EXISTS qa_playbook_items_context_arrays_chk;
ALTER TABLE qa_playbook_items ADD CONSTRAINT qa_playbook_items_context_arrays_chk
  CHECK (
    jsonb_typeof(preconditions) = 'array' AND
    jsonb_typeof(edge_cases) = 'array' AND
    jsonb_typeof("references") = 'array'
  );
