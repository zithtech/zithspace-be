-- =====================================================
--  RBAC — Role-Based Access Control
--  Migration: add_rbac_tables
--  Date: 2026-02-26
-- =====================================================

-- 1. PERMISSIONS
--    Static list of all named permissions seeded once.
CREATE TABLE IF NOT EXISTS "permissions" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "name"        TEXT        NOT NULL,
  "resource"    TEXT        NOT NULL,
  "action"      TEXT        NOT NULL,
  "description" TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "permissions_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "permissions_name_unique" UNIQUE ("name")
);

CREATE INDEX IF NOT EXISTS "permissions_resource_idx" ON "permissions" ("resource");

-- 2. ROLES
--    Dynamic, tenant-scoped role definitions.
CREATE TABLE IF NOT EXISTS "roles" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   TEXT        NOT NULL,
  "name"        TEXT        NOT NULL,
  "slug"        TEXT        NOT NULL,
  "description" TEXT,
  "is_system"   BOOLEAN     NOT NULL DEFAULT FALSE,
  "is_active"   BOOLEAN     NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "roles_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "roles_tenant_slug_unique" UNIQUE ("tenant_id", "slug"),
  CONSTRAINT "roles_tenant_fkey"       FOREIGN KEY ("tenant_id")
    REFERENCES "tenants" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "roles_tenant_id_idx" ON "roles" ("tenant_id");

-- 3. ROLE_PERMISSIONS
--    Which permissions each role holds.
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id"        UUID        NOT NULL,
  "permission_id"  UUID        NOT NULL,
  "granted_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "granted_by_id"  TEXT,

  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id"),
  CONSTRAINT "rp_role_fkey"          FOREIGN KEY ("role_id")
    REFERENCES "roles" ("id") ON DELETE CASCADE,
  CONSTRAINT "rp_permission_fkey"    FOREIGN KEY ("permission_id")
    REFERENCES "permissions" ("id") ON DELETE CASCADE
);

-- 4. USER_ROLES
--    Which roles each user holds (supports optional expiry for temporary roles).
CREATE TABLE IF NOT EXISTS "user_roles" (
  "user_id"        TEXT        NOT NULL,
  "role_id"        UUID        NOT NULL,
  "tenant_id"      TEXT        NOT NULL,
  "assigned_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "assigned_by_id" TEXT,
  "expires_at"     TIMESTAMPTZ,

  CONSTRAINT "user_roles_pkey"      PRIMARY KEY ("user_id", "role_id"),
  CONSTRAINT "ur_user_fkey"         FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "ur_role_fkey"         FOREIGN KEY ("role_id")
    REFERENCES "roles" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_roles_user_tenant_idx" ON "user_roles" ("user_id", "tenant_id");

-- 5. AUTHORIZATION_LOGS
--    Audit trail — every permission grant/denial.
CREATE TABLE IF NOT EXISTS "authorization_logs" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   TEXT        NOT NULL,
  "user_id"     TEXT,
  "permission"  TEXT        NOT NULL,
  "resource"    TEXT        NOT NULL,
  "resource_id" TEXT,
  "result"      TEXT        NOT NULL,    -- 'granted' | 'denied'
  "reason"      TEXT,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "endpoint"    TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "authorization_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "auth_logs_tenant_user_idx" ON "authorization_logs" ("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "auth_logs_created_at_idx"  ON "authorization_logs" ("created_at");
