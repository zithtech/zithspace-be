-- Create mail_configurations table
CREATE TABLE IF NOT EXISTS mail_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('GOOGLE', 'MICROSOFT', 'ZOHO')),
    email VARCHAR(255) NOT NULL,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_username VARCHAR(255) NOT NULL,
    smtp_password TEXT NOT NULL, -- Encrypted in application
    enable_ssl BOOLEAN NOT NULL DEFAULT true,
    default_from_email VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_test_sent_at TIMESTAMP,
    test_status VARCHAR(50) CHECK (test_status IN ('SUCCESS', 'FAILED', 'PENDING')),
    test_error_message TEXT,
    metadata JSONB,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    deleted_by UUID REFERENCES users(id)
);

-- Create unique constraint on tenant_id (one mail config per tenant)
CREATE UNIQUE INDEX mail_configurations_tenant_id_unique ON mail_configurations(tenant_id) WHERE deleted_at IS NULL;

-- Create indexes for better performance
CREATE INDEX mail_configurations_tenant_id_idx ON mail_configurations(tenant_id);
CREATE INDEX mail_configurations_provider_idx ON mail_configurations(provider);
CREATE INDEX mail_configurations_email_idx ON mail_configurations(email);
CREATE INDEX mail_configurations_is_active_idx ON mail_configurations(is_active);
CREATE INDEX mail_configurations_created_at_idx ON mail_configurations(created_at);
CREATE INDEX mail_configurations_deleted_at_idx ON mail_configurations(deleted_at);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_mail_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER mail_configurations_updated_at_trigger
    BEFORE UPDATE ON mail_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_mail_configurations_updated_at();

-- Add comments for documentation
COMMENT ON TABLE mail_configurations IS 'Stores mail service provider configurations for each tenant';
COMMENT ON COLUMN mail_configurations.provider IS 'Email provider: GOOGLE, MICROSOFT, or ZOHO';
COMMENT ON COLUMN mail_configurations.smtp_password IS 'SMTP password (should be encrypted in application)';
COMMENT ON COLUMN mail_configurations.enable_ssl IS 'Whether to use SSL/TLS for SMTP connections';
COMMENT ON COLUMN mail_configurations.default_from_email IS 'Default email address for sending emails';
COMMENT ON COLUMN mail_configurations.last_test_sent_at IS 'Timestamp of last test email sent';
COMMENT ON COLUMN mail_configurations.test_status IS 'Status of last test email: SUCCESS, FAILED, or PENDING';
COMMENT ON COLUMN mail_configurations.test_error_message IS 'Error message from last failed test email';
