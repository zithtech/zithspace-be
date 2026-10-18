-- Adds contact_name column to the leads table for Lead Intake & direct client contacts

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_leads_contact_name
    ON leads (tenant_id, contact_name)
    WHERE contact_name IS NOT NULL;
