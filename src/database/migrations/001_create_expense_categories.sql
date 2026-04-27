-- Create expense_categories table
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) NOT NULL, -- Hex color code
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID,
    
    -- Constraints
    CONSTRAINT expense_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT expense_categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT expense_categories_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Unique constraint for category names within a tenant (excluding deleted records)
    CONSTRAINT expense_categories_name_tenant_unique UNIQUE (name, tenant_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant_id ON expense_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_is_active ON expense_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_expense_categories_created_at ON expense_categories(created_at);
CREATE INDEX IF NOT EXISTS idx_expense_categories_deleted_at ON expense_categories(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create partial unique index to handle soft deletes
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_name_tenant_active 
ON expense_categories(name, tenant_id) 
WHERE deleted_at IS NULL;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_expense_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER expense_categories_updated_at_trigger
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_expense_categories_updated_at();

-- Add RLS (Row Level Security) policies
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see categories from their own tenant
CREATE POLICY expense_categories_select_policy ON expense_categories
    FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id') AND deleted_at IS NULL);

-- Policy: Users can only insert categories for their own tenant
CREATE POLICY expense_categories_insert_policy ON expense_categories
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id'));

-- Policy: Users can only update categories from their own tenant
CREATE POLICY expense_categories_update_policy ON expense_categories
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_tenant_id') AND deleted_at IS NULL);

-- Policy: Users can only delete categories from their own tenant
CREATE POLICY expense_categories_delete_policy ON expense_categories
    FOR DELETE
    USING (tenant_id = current_setting('app.current_tenant_id'));
