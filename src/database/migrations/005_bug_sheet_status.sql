-- Sheet lifecycle: active (default) | current (one per folder) | completed.
-- Folder-level "completed" is derived in the API as completedSheets / sheets.

ALTER TABLE bug_sheets
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE bug_sheets
  DROP CONSTRAINT IF EXISTS bug_sheets_status_check;
ALTER TABLE bug_sheets
  ADD CONSTRAINT bug_sheets_status_check
  CHECK (status IN ('active', 'current', 'completed'));

-- Enforce: at most one 'current' sheet per folder.
CREATE UNIQUE INDEX IF NOT EXISTS bug_sheets_one_current_per_folder
  ON bug_sheets (folder_id) WHERE status = 'current';
