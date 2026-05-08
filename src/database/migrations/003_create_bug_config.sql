-- Tenant-configurable bug severity & type dropdowns.
-- TEXT ids to match the existing schema convention.

CREATE TABLE IF NOT EXISTS bug_severity_options (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL,
  key           TEXT NOT NULL,       -- slug stored on bugs.severity
  label         TEXT NOT NULL,
  color         TEXT,                -- hex token for the dot
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_default    BOOLEAN NOT NULL DEFAULT false,  -- pre-selected for new bugs
  is_system     BOOLEAN NOT NULL DEFAULT false,  -- system-seeded; cannot be deleted
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS bug_severity_options_tenant_idx
  ON bug_severity_options (tenant_id, sort_order);

CREATE TABLE IF NOT EXISTS bug_type_options (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS bug_type_options_tenant_idx
  ON bug_type_options (tenant_id, sort_order);

-- Reuse the trigger fn from migration 002
DROP TRIGGER IF EXISTS bug_severity_options_updated_at ON bug_severity_options;
CREATE TRIGGER bug_severity_options_updated_at
  BEFORE UPDATE ON bug_severity_options
  FOR EACH ROW EXECUTE FUNCTION bug_list_set_updated_at();

DROP TRIGGER IF EXISTS bug_type_options_updated_at ON bug_type_options;
CREATE TRIGGER bug_type_options_updated_at
  BEFORE UPDATE ON bug_type_options
  FOR EACH ROW EXECUTE FUNCTION bug_list_set_updated_at();
