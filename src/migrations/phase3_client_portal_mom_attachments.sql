-- =============================================================================
-- Client Portal — Phase 3 (MOM attachments)
--
-- Adds an attachments table to portal_moms so staff can attach uploaded
-- files OR shared links (e.g. a DocumentHub URL, Figma, etc) to a meeting.
-- Portal users see them on the meeting detail page; clicking opens an
-- in-app preview drawer.
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_mom_attachments (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL,
  mom_id              TEXT NOT NULL REFERENCES portal_moms(id) ON DELETE CASCADE,
  kind                VARCHAR(20) NOT NULL,
  -- File attachment fields (kind='file')
  file_name           VARCHAR(255),
  file_url            TEXT,
  file_size_bytes     INTEGER,
  mime_type           VARCHAR(120),
  -- Link attachment fields (kind='link')
  link_url            TEXT,
  link_label          VARCHAR(255),
  position            INTEGER NOT NULL DEFAULT 0,
  created_by_user_id  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_mom_attachments_kind_check
    CHECK (kind IN ('file','link'))
);

CREATE INDEX IF NOT EXISTS portal_mom_attachments_mom_idx
  ON portal_mom_attachments (mom_id, position ASC);
