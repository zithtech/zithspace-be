-- src/modules/pipeline/db/migrations/003_aadhaar_hash.sql

ALTER TABLE pipeline_candidates ADD COLUMN IF NOT EXISTS aadhaar_hash VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_candidates_tenant_id_aadhaar_hash_key ON pipeline_candidates (tenant_id, aadhaar_hash);
