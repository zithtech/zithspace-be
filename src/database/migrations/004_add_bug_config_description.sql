-- Add a description field to bug severity and type config options.
ALTER TABLE bug_severity_options
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE bug_type_options
  ADD COLUMN IF NOT EXISTS description TEXT;
