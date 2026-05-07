-- Add trash and archive functionality to bug_folders
-- Add status and original_status column to bug_folders
ALTER TABLE bug_folders
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS original_status TEXT;

-- Update the status constraint to include 'archived' and 'trash'
ALTER TABLE bug_folders
  DROP CONSTRAINT IF EXISTS bug_folders_status_check;
ALTER TABLE bug_folders
  ADD CONSTRAINT bug_folders_status_check
  CHECK (status IN ('active', 'archived', 'trash'));

-- Create index for efficient trash/archive queries
CREATE INDEX IF NOT EXISTS bug_folders_status_idx ON bug_folders (tenant_id, status);
