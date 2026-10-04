-- Project Agreements — Password Protection & Unlock Sessions (migration 013)
--
-- Adds support for password protection at Tenant (global), Agreement (per-doc), and Template (per-template) levels,
-- server-side hashed unlock sessions, rate-limiting tracking, and audit logging.

-- 1. Add tenant-level security settings & password versioning
ALTER TABLE pa_branding 
  ADD COLUMN IF NOT EXISTS password_protection_mode text NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN IF NOT EXISTS tenant_password_hash text,
  ADD COLUMN IF NOT EXISTS tenant_password_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS require_password_for_pdf boolean NOT NULL DEFAULT true;

-- Add check constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pa_branding_protection_mode_check'
  ) THEN
    ALTER TABLE pa_branding
      ADD CONSTRAINT pa_branding_protection_mode_check
      CHECK (password_protection_mode IN ('DISABLED', 'TENANT_GLOBAL', 'PER_AGREEMENT', 'CUSTOM_OVERRIDE'));
  END IF;
END $$;

-- 2a. Add per-agreement password settings & versioning
ALTER TABLE pa_agreements 
  ADD COLUMN IF NOT EXISTS is_password_protected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_mode text NOT NULL DEFAULT 'INHERIT_TENANT',
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pa_agreements_password_mode_check'
  ) THEN
    ALTER TABLE pa_agreements
      ADD CONSTRAINT pa_agreements_password_mode_check
      CHECK (password_mode IN ('INHERIT_TENANT', 'CUSTOM', 'NONE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pa_agreements_password_protected_idx 
  ON pa_agreements (tenant_id, is_password_protected) WHERE deleted_at IS NULL;

-- 2b. Add per-template password settings & versioning
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

-- 3. Server-side Hashed Unlock Sessions
CREATE TABLE IF NOT EXISTS pa_agreement_unlock_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  agreement_id        uuid REFERENCES pa_agreements(id) ON DELETE CASCADE,
  template_id         uuid REFERENCES pa_agreement_templates(id) ON DELETE CASCADE,
  user_id             uuid,
  client_id           uuid,
  
  session_token_hash  text NOT NULL UNIQUE,
  password_scope      text NOT NULL CHECK (password_scope IN ('TENANT', 'AGREEMENT', 'TEMPLATE')),
  password_version    integer NOT NULL,
  ip_address          text,
  user_agent          text,
  
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pa_unlock_sessions_resource_check CHECK (agreement_id IS NOT NULL OR template_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS pa_unlock_sessions_token_idx 
  ON pa_agreement_unlock_sessions (session_token_hash);

-- 4. Rate Limiting / Brute-Force Tracking Table
CREATE TABLE IF NOT EXISTS pa_password_unlock_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  resource_id    uuid NOT NULL, -- agreement_id or template_id
  ip_address     text NOT NULL,
  attempt_count  integer NOT NULL DEFAULT 1,
  locked_until   timestamptz,
  last_attempt   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pa_unlock_attempts_ip_ag_uidx 
  ON pa_password_unlock_attempts (tenant_id, resource_id, ip_address);

-- 5. Security Audit Logging Table
CREATE TABLE IF NOT EXISTS pa_security_audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  agreement_id   uuid,
  template_id    uuid,
  actor_id       uuid,
  actor_type     text NOT NULL CHECK (actor_type IN ('STAFF_USER', 'CLIENT_USER', 'SYSTEM')),
  action         text NOT NULL,
  ip_address     text,
  details        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS setup for new tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pa_agreement_unlock_sessions',
    'pa_password_unlock_attempts',
    'pa_security_audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;
