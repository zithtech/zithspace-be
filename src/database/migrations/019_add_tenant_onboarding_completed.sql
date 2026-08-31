-- Migration to add onboarding_completed flag to tenants table

-- 1. Add the column with default false
ALTER TABLE tenants ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;

-- 2. Update existing tenants to true so they are not interrupted
UPDATE tenants SET onboarding_completed = true;
