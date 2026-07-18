-- Per-tenant AI configuration (ZAI predefined pick, or BYO provider/model/key).
CREATE TABLE IF NOT EXISTS tenant_ai_settings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mode              TEXT NOT NULL DEFAULT 'platform',   -- 'platform' | 'byo'
    provider          TEXT,                                -- 'gemini' | 'openai_compatible' | 'anthropic'
    model             TEXT,                                -- catalog key (platform) or model id (byo)
    api_key_encrypted TEXT,                                -- byo only, AES-256-GCM
    base_url          TEXT,                                -- byo openai_compatible only
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_error        TEXT,
    last_error_at     TIMESTAMP WITH TIME ZONE,
    last_used_mode    TEXT,
    created_by        TEXT,
    updated_by        TEXT,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS tenant_ai_settings_tenant_idx ON tenant_ai_settings (tenant_id);
