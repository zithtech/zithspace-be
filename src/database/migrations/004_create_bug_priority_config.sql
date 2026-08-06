-- Tenant-configurable priority dropdown, shared by the bug list and the QA
-- workspace (test cases, runs). Mirrors bug_severity_options.

CREATE TABLE IF NOT EXISTS bug_priority_options (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL,
  key           TEXT NOT NULL,       -- slug stored on records
  label         TEXT NOT NULL,
  color         TEXT,                -- hex token for the dot
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_default    BOOLEAN NOT NULL DEFAULT false,  -- pre-selected for new records
  is_system     BOOLEAN NOT NULL DEFAULT false,  -- system-seeded; cannot be deleted
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS bug_priority_options_tenant_idx
  ON bug_priority_options (tenant_id, sort_order);

-- Reuse the trigger fn from migration 002
DROP TRIGGER IF EXISTS bug_priority_options_updated_at ON bug_priority_options;
CREATE TRIGGER bug_priority_options_updated_at
  BEFORE UPDATE ON bug_priority_options
  FOR EACH ROW EXECUTE FUNCTION bug_list_set_updated_at();
