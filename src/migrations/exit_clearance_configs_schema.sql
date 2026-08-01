CREATE TABLE IF NOT EXISTS exit_clearance_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,
  department VARCHAR NOT NULL,
  item_name VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- We don't necessarily need to insert defaults here since we don't know the tenant_id. 
-- For a multi-tenant system, it's better if the frontend handles this or we insert it dynamically.
-- But since this is a migration, we can let it be empty and let users add configurations. 
-- Wait, let's just insert default ones for existing tenants if we want, or just let it be empty.
-- Since the frontend handles an empty array by showing nothing, the user can just add them via UI.
