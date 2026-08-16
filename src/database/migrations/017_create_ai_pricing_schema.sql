CREATE TABLE IF NOT EXISTS ai_credit_config (
    key VARCHAR(100) PRIMARY KEY,
    value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_credit_config (key, value, description) VALUES
('credit_conversion_rate', '0.005', 'Conversion rate to base currency (e.g. USD)'),
('minimum_credit', '1', 'Minimum credits charged per request'),
('rounding_strategy', 'CEIL', 'How to round fractional credits (CEIL, FLOOR, ROUND)')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE usage_events 
ADD COLUMN IF NOT EXISTS usage_key VARCHAR(100) DEFAULT 'ai_credits_month',
ADD COLUMN IF NOT EXISTS ai_request_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS provider VARCHAR(100),
ADD COLUMN IF NOT EXISTS model VARCHAR(100),
ADD COLUMN IF NOT EXISTS prompt_tokens INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_tokens INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS provider_cost NUMERIC(18,8) DEFAULT 0;
