-- QA modules become project-owned.
--
-- A module (Billing, Checkout, …) only means something inside a product, so
-- QA Space → Settings → Modules now asks which project a module belongs to.
-- `project_id` points at `projects.id`; `project_name` is a snapshot so the
-- list still reads correctly if a project is later renamed or removed.
--
-- Existing rows keep NULL until someone edits them — the API requires a
-- project on write, not on read, so nothing already filed under a module
-- breaks. Uniqueness stays enforced in the controller (name is unique within
-- a project) rather than by a unique index, so legacy duplicates cannot make
-- this migration fail.

ALTER TABLE qa_todo_modules ADD COLUMN IF NOT EXISTS project_id   TEXT;
ALTER TABLE qa_todo_modules ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_qa_todo_modules_project
  ON qa_todo_modules (tenant_id, project_id);
