-- Add trash functionality to bug_sheets
-- Add original_status column to preserve status before moving to trash
ALTER TABLE bug_sheets
  ADD COLUMN IF NOT EXISTS original_status TEXT;

-- Update the status constraint to include 'trash'
ALTER TABLE bug_sheets
  DROP CONSTRAINT IF EXISTS bug_sheets_status_check;
ALTER TABLE bug_sheets
  ADD CONSTRAINT bug_sheets_status_check
  CHECK (status IN ('active', 'current', 'completed', 'archived', 'trash'));

-- Create index for efficient trash queries
CREATE INDEX IF NOT EXISTS bug_sheets_trash_idx ON bug_sheets (tenant_id, status) WHERE status = 'trash';
