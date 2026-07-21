-- Per-user AI access toggle. Opt-out model: everyone is enabled by default,
-- admins can turn it off per user from the Members page.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;
