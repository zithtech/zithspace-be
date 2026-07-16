CREATE TABLE IF NOT EXISTS tenant_usage (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    usage_key VARCHAR(100) NOT NULL,
    period VARCHAR(50) NOT NULL,
    used NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, usage_key, period)
);
