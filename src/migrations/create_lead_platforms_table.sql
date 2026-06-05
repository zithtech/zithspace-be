-- Lead platforms — sources that leads come from.
-- Two flavours: 'online' (Upwork, LinkedIn, Freelancer, Fiverr, …) and
-- 'website' (own marketing sites — Zukvo, Zithtech, …). Configured per
-- tenant so different workspaces can curate their own source list.

CREATE TABLE IF NOT EXISTS lead_platforms (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT NOT NULL,           -- matches existing lead_statuses / leads convention
    name         VARCHAR(120) NOT NULL,
    code         VARCHAR(80)  NOT NULL,  -- auto-derived from name, immutable after create
    type         VARCHAR(20)  NOT NULL CHECK (type IN ('online', 'website')),
    url          VARCHAR(500),
    logo_url     TEXT,                    -- base64 data URL or remote URL
    description  TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    "order"      INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT lead_platforms_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_lead_platforms_tenant
    ON lead_platforms (tenant_id, "order", created_at);

CREATE INDEX IF NOT EXISTS idx_lead_platforms_type
    ON lead_platforms (tenant_id, type)
    WHERE is_active = true;
