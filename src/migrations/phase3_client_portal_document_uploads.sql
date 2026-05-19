-- =============================================================================
-- Client Portal — Phase 3 (Documents — uploads from clients)
-- Lets portal users add documents (file upload or external URL). We track
-- which portal user uploaded by a new optional column and make the existing
-- staff `uploaded_by_id` nullable so portal uploads don't need a staff row.
-- =============================================================================

ALTER TABLE client_documents_v2
  ADD COLUMN IF NOT EXISTS uploaded_by_portal_user_id TEXT;

-- Drop NOT NULL on uploaded_by_id (portal uploads have no staff user).
ALTER TABLE client_documents_v2
  ALTER COLUMN uploaded_by_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS client_documents_v2_portal_uploader_idx
  ON client_documents_v2 (tenant_id, uploaded_by_portal_user_id);
