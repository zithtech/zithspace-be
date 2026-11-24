-- Add meeting_type to time_tracking_entries
ALTER TABLE time_tracking_entries ADD COLUMN IF NOT EXISTS meeting_type TEXT;
