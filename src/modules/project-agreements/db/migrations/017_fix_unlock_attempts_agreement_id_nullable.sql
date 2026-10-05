-- Allow agreement_id to be NULL in pa_password_unlock_attempts so template unlock attempts can be tracked
ALTER TABLE pa_password_unlock_attempts 
  ALTER COLUMN agreement_id DROP NOT NULL;
