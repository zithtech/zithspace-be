-- Adds a discriminator for where a lead came from (online gig platform vs
-- own-website inquiry) plus the company-side fields that website inquiries
-- need but platform leads usually skip.

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS lead_source_kind VARCHAR(20) NOT NULL DEFAULT 'platform'
        CHECK (lead_source_kind IN ('platform', 'website')),
    ADD COLUMN IF NOT EXISTS company         VARCHAR(255),
    ADD COLUMN IF NOT EXISTS company_domain  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS company_size    VARCHAR(50),
    ADD COLUMN IF NOT EXISTS inquiry_message TEXT,
    ADD COLUMN IF NOT EXISTS website_source  VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_leads_lead_source_kind
    ON leads (tenant_id, lead_source_kind);

CREATE INDEX IF NOT EXISTS idx_leads_website_source
    ON leads (tenant_id, website_source)
    WHERE website_source IS NOT NULL;
