-- =============================================================================
-- Client Portal — Phase 2 (Documents)
-- Tracks portal-user views/downloads of client_documents_v2 rows so staff can
-- see what their client has actually opened.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_document_portal_views (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  document_id     TEXT NOT NULL,
  portal_user_id  TEXT NOT NULL REFERENCES client_portal_users(id) ON DELETE CASCADE,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_count      INTEGER NOT NULL DEFAULT 1,
  download_count  INTEGER NOT NULL DEFAULT 0,
  last_event      VARCHAR(20) NOT NULL DEFAULT 'view'
);

CREATE UNIQUE INDEX IF NOT EXISTS client_document_portal_views_uniq
  ON client_document_portal_views (document_id, portal_user_id);
CREATE INDEX IF NOT EXISTS client_document_portal_views_doc_idx
  ON client_document_portal_views (tenant_id, document_id);
