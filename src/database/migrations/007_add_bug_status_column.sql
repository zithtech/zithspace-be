-- Add bug_status column to bugs table
-- This column tracks the work progress status: not started, pending, completed

ALTER TABLE bugs ADD COLUMN bug_status TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS bugs_bug_status_idx ON bugs (tenant_id, bug_status);

-- Set default value for existing records
UPDATE bugs SET bug_status = 'not started' WHERE bug_status IS NULL;
