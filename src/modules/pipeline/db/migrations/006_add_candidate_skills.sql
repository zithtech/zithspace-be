-- src/modules/pipeline/db/migrations/006_add_candidate_skills.sql
ALTER TABLE pipeline_candidates ADD COLUMN IF NOT EXISTS skills jsonb DEFAULT '[]'::jsonb;
