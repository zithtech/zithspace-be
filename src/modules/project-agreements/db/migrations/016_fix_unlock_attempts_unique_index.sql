-- Ensure unique index matching (tenant_id, resource_id, ip_address) on pa_password_unlock_attempts

-- Drop legacy unique index if it was created on agreement_id
DROP INDEX IF EXISTS pa_unlock_attempts_ip_ag_uidx;

-- Ensure resource_id column exists
ALTER TABLE pa_password_unlock_attempts
  ADD COLUMN IF NOT EXISTS resource_id uuid;

-- Backfill resource_id from agreement_id if missing
UPDATE pa_password_unlock_attempts 
   SET resource_id = agreement_id 
 WHERE resource_id IS NULL AND agreement_id IS NOT NULL;

-- Create unique index on (tenant_id, resource_id, ip_address)
CREATE UNIQUE INDEX IF NOT EXISTS pa_unlock_attempts_res_uidx 
  ON pa_password_unlock_attempts (tenant_id, resource_id, ip_address);
