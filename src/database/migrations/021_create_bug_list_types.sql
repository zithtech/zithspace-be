CREATE TABLE IF NOT EXISTS bug_list_types (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key VARCHAR(50) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

CREATE INDEX IF NOT EXISTS bug_list_types_tenant_idx
  ON bug_list_types (tenant_id, sort_order);

DROP TRIGGER IF EXISTS bug_list_types_updated_at ON bug_list_types;
CREATE TRIGGER bug_list_types_updated_at
  BEFORE UPDATE ON bug_list_types
  FOR EACH ROW
  EXECUTE FUNCTION bug_list_set_updated_at();
