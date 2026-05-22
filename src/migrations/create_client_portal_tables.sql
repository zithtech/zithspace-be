-- =============================================================================
-- Client Portal — Phase 1
-- Per-contact login credentials for client-facing portal.
-- Separate auth identity from staff `users` table; isolated session table.
--
-- Note on types: IDs are TEXT (not UUID) to match the existing Prisma-managed
-- tables (`clients_v2`, `client_contacts_v2`, `users`, `tenants`), which all
-- use `String @default(uuid())` → `text`. Using UUID here would break joins
-- with operator-not-exists (42883) since PostgreSQL won't compare text=uuid
-- without an explicit cast. Values are still UUIDs at the application layer.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_portal_users (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL,
  client_id           TEXT NOT NULL,
  contact_id          TEXT,
  username            VARCHAR(120) NOT NULL,
  email               VARCHAR(255) NOT NULL,
  password_hash       VARCHAR(255) NOT NULL,
  display_name        VARCHAR(200),
  status              VARCHAR(20) NOT NULL DEFAULT 'active',
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,
  last_login_ip       VARCHAR(64),
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_portal_users_status_check
    CHECK (status IN ('active', 'disabled', 'pending'))
);

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_users_tenant_username_uniq
  ON client_portal_users (tenant_id, LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS client_portal_users_tenant_email_uniq
  ON client_portal_users (tenant_id, LOWER(email));
CREATE INDEX IF NOT EXISTS client_portal_users_client_idx
  ON client_portal_users (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS client_portal_users_contact_idx
  ON client_portal_users (tenant_id, contact_id);

CREATE TABLE IF NOT EXISTS client_portal_sessions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  portal_user_id  TEXT NOT NULL REFERENCES client_portal_users(id) ON DELETE CASCADE,
  refresh_token   VARCHAR(512) NOT NULL,
  user_agent      VARCHAR(512),
  ip_address      VARCHAR(64),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS client_portal_sessions_token_uniq
  ON client_portal_sessions (refresh_token);
CREATE INDEX IF NOT EXISTS client_portal_sessions_user_idx
  ON client_portal_sessions (tenant_id, portal_user_id);

CREATE TABLE IF NOT EXISTS client_portal_login_audit (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  portal_user_id  TEXT,
  username        VARCHAR(120),
  event           VARCHAR(40) NOT NULL,
  ip_address      VARCHAR(64),
  user_agent      VARCHAR(512),
  detail          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_portal_login_audit_user_idx
  ON client_portal_login_audit (tenant_id, portal_user_id, created_at DESC);
