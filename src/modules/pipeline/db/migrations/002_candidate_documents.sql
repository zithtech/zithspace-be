-- src/modules/pipeline/db/migrations/002_candidate_documents.sql

ALTER TABLE pipeline_candidates
ADD COLUMN IF NOT EXISTS document_portal_token uuid;

CREATE TABLE IF NOT EXISTS pipeline_candidate_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  candidate_id uuid NOT NULL REFERENCES pipeline_candidates(id) ON DELETE CASCADE,
  document_type varchar NOT NULL,
  document_url varchar,
  status varchar NOT NULL DEFAULT 'Pending',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
