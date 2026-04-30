-- SQL Migration: Add New Columns to Leads Table
-- This migration adds job metadata, client quality data, and AI & proposal fields

ALTER TABLE leads 
-- Job Metadata
ADD COLUMN external_job_id TEXT,
ADD COLUMN experience_level TEXT,
ADD COLUMN job_type TEXT, -- e.g., 'fixed' or 'hourly'
ADD COLUMN budget TEXT,
ADD COLUMN hourly_rate TEXT,

-- Client Quality Data
ADD COLUMN client_rating TEXT,
ADD COLUMN client_spend TEXT,
ADD COLUMN client_jobs_posted TEXT,
ADD COLUMN client_payment_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN client_phone_verified BOOLEAN DEFAULT FALSE,

-- AI & Proposal Data
ADD COLUMN ai_score INTEGER DEFAULT 0,
ADD COLUMN proposal_text TEXT,
ADD COLUMN template_used TEXT;

-- Add indexes for frequently queried new columns
CREATE INDEX IF NOT EXISTS idx_leads_external_job_id ON leads(external_job_id);
CREATE INDEX IF NOT EXISTS idx_leads_experience_level ON leads(experience_level);
CREATE INDEX IF NOT EXISTS idx_leads_job_type ON leads(job_type);
CREATE INDEX IF NOT EXISTS idx_leads_ai_score ON leads(ai_score);
CREATE INDEX IF NOT EXISTS idx_leads_client_payment_verified ON leads(client_payment_verified);
