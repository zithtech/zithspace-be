-- SQL Migration: Create Leads Table
-- This table is designed for multi-tenancy and stores full lead details including dynamic documents and skills.

-- Ensure uuid-ossp extension is enabled for ID generation if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    
    -- Client Details
    client_name VARCHAR(255) NOT NULL,
    client_mail VARCHAR(255) NOT NULL,
    client_phone VARCHAR(50),
    client_location VARCHAR(255),
    
    -- Job Specification
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    skills JSONB DEFAULT '[]'::JSONB, -- Stores array of skill strings
    duration VARCHAR(100),
    hour_based_amount DECIMAL(15, 2) DEFAULT 0.00,
    job_link TEXT,
    est_project_duration VARCHAR(100),
    
    -- Status & Metadata
    status VARCHAR(50) DEFAULT 'Open',
    actions_item TEXT, -- Tracks 'Next Action Items'
    timeline_start TIMESTAMP,
    timeline_end TIMESTAMP,
    posted_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Documents
    documents JSONB DEFAULT '[]'::JSONB, -- Stores array of {name, url} objects
    
    -- System Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for multi-tenancy performance
ALTER TABLE leads
ADD CONSTRAINT fk_leads_tenant
FOREIGN KEY (tenant_id)
REFERENCES tenants(id)
ON DELETE CASCADE;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
