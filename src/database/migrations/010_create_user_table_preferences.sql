-- Per-user, per-table UI preferences (density, hidden columns, etc.).
-- One row per (user, tenant, table_key). Stored as JSONB so any table can
-- persist arbitrary shape without further schema changes.

CREATE TABLE IF NOT EXISTS user_table_preferences (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  table_key     TEXT NOT NULL,
  preferences   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id, table_key)
);

CREATE INDEX IF NOT EXISTS user_table_preferences_user_idx
  ON user_table_preferences (user_id, tenant_id);
