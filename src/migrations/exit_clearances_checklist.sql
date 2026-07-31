ALTER TABLE exit_clearances ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '{}'::jsonb;
