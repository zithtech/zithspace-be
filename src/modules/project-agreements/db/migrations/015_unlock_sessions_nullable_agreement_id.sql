-- Allow agreement_id to be NULL in pa_agreement_unlock_sessions so template unlocks can be recorded
ALTER TABLE pa_agreement_unlock_sessions 
  ALTER COLUMN agreement_id DROP NOT NULL;
