-- Bug List module: QA workspace tables
-- Folders -> Sheets -> Bugs.  Bugs link to tickets once converted.
-- IMPORTANT: existing tables in this DB use TEXT ids (Prisma default), so
-- every id / FK column here must also be TEXT to match for FK compatibility.

CREATE TABLE IF NOT EXISTS bug_folders (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  project_id      TEXT,
  client_id       TEXT,
  color           TEXT,
  created_by_id   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bug_folders_tenant_idx ON bug_folders (tenant_id);
CREATE INDEX IF NOT EXISTS bug_folders_project_idx ON bug_folders (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS bug_folders_creator_idx ON bug_folders (tenant_id, created_by_id);

CREATE TABLE IF NOT EXISTS bug_sheets (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  folder_id       TEXT NOT NULL REFERENCES bug_folders(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  created_by_id   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bug_sheets_tenant_idx ON bug_sheets (tenant_id);
CREATE INDEX IF NOT EXISTS bug_sheets_folder_idx ON bug_sheets (folder_id);

CREATE TABLE IF NOT EXISTS bugs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  folder_id       TEXT NOT NULL REFERENCES bug_folders(id) ON DELETE CASCADE,
  sheet_id        TEXT NOT NULL REFERENCES bug_sheets(id) ON DELETE CASCADE,
  bug_number      TEXT,
  title           TEXT,
  description     TEXT NOT NULL,
  module          TEXT,
  bug_type        TEXT, -- ui | functional | api
  severity        TEXT, -- blocker | critical | major | minor
  status          TEXT NOT NULL DEFAULT 'new', -- new | converted | ignored | verified | reopened
  tags            TEXT[] NOT NULL DEFAULT '{}'::text[],
  ticket_id       TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  assignee_id     TEXT,
  created_by_id   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bugs_tenant_idx ON bugs (tenant_id);
CREATE INDEX IF NOT EXISTS bugs_sheet_idx ON bugs (sheet_id);
CREATE INDEX IF NOT EXISTS bugs_folder_idx ON bugs (folder_id);
CREATE INDEX IF NOT EXISTS bugs_status_idx ON bugs (tenant_id, status);
CREATE INDEX IF NOT EXISTS bugs_assignee_idx ON bugs (tenant_id, assignee_id);
CREATE INDEX IF NOT EXISTS bugs_creator_idx ON bugs (tenant_id, created_by_id);
CREATE INDEX IF NOT EXISTS bugs_ticket_idx ON bugs (ticket_id);
CREATE INDEX IF NOT EXISTS bugs_module_idx ON bugs (tenant_id, module);

CREATE TABLE IF NOT EXISTS bug_attachments (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bug_id          TEXT NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_size       BIGINT,
  file_type       TEXT NOT NULL,
  uploaded_by_id  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bug_attachments_bug_idx ON bug_attachments (bug_id);

CREATE TABLE IF NOT EXISTS bug_external_links (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bug_id          TEXT NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
  label           TEXT,
  url             TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bug_external_links_bug_idx ON bug_external_links (bug_id);

-- Auto-update updated_at on bug_folders / bug_sheets / bugs
CREATE OR REPLACE FUNCTION bug_list_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bug_folders_updated_at ON bug_folders;
CREATE TRIGGER bug_folders_updated_at
  BEFORE UPDATE ON bug_folders
  FOR EACH ROW EXECUTE FUNCTION bug_list_set_updated_at();

DROP TRIGGER IF EXISTS bug_sheets_updated_at ON bug_sheets;
CREATE TRIGGER bug_sheets_updated_at
  BEFORE UPDATE ON bug_sheets
  FOR EACH ROW EXECUTE FUNCTION bug_list_set_updated_at();

DROP TRIGGER IF EXISTS bugs_updated_at ON bugs;
CREATE TRIGGER bugs_updated_at
  BEFORE UPDATE ON bugs
  FOR EACH ROW EXECUTE FUNCTION bug_list_set_updated_at();



ALTER TABLE bugs ADD COLUMN comments TEXT;