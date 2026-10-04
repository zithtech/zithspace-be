-- Project Agreements — Add Template Password Columns & Unlock Session Columns (migration 014)

-- Add per-template password settings & versioning
ALTER TABLE pa_agreement_templates 
  ADD COLUMN IF NOT EXISTS is_password_protected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_mode text NOT NULL DEFAULT 'INHERIT_TENANT',
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pa_templates_password_mode_check'
  ) THEN
    ALTER TABLE pa_agreement_templates
      ADD CONSTRAINT pa_templates_password_mode_check
      CHECK (password_mode IN ('INHERIT_TENANT', 'CUSTOM', 'NONE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pa_templates_password_protected_idx 
  ON pa_agreement_templates (tenant_id, is_password_protected) WHERE deleted_at IS NULL;

-- Ensure template_id and resource_id columns exist on session and rate limit tables
ALTER TABLE pa_agreement_unlock_sessions
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES pa_agreement_templates(id) ON DELETE CASCADE,
  ALTER COLUMN agreement_id DROP NOT NULL;

ALTER TABLE pa_agreement_unlock_sessions 
  DROP CONSTRAINT IF EXISTS pa_agreement_unlock_sessions_password_scope_check;

ALTER TABLE pa_agreement_unlock_sessions 
  ADD CONSTRAINT pa_agreement_unlock_sessions_password_scope_check 
  CHECK (password_scope IN ('TENANT', 'AGREEMENT', 'TEMPLATE'));


ALTER TABLE pa_security_audit_logs
  ADD COLUMN IF NOT EXISTS template_id uuid;

ALTER TABLE pa_password_unlock_attempts
  ADD COLUMN IF NOT EXISTS resource_id uuid,
  ALTER COLUMN agreement_id DROP NOT NULL;

-- Backfill resource_id from agreement_id if missing
UPDATE pa_password_unlock_attempts SET resource_id = agreement_id WHERE resource_id IS NULL AND agreement_id IS NOT NULL;
