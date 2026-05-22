-- =============================================================================
-- Client Portal — Phase 3 (Minutes of Meeting)
--
-- New domain — not wrapping an existing module. MOMs are staff-authored
-- meeting records (with the client) that get shared back to the client
-- portal. Action items can be converted to portal support tickets (Phase 3
-- of conversion targets will add staff tickets + change requests once those
-- modules exist).
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_moms (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id          TEXT NOT NULL,
  client_id          TEXT NOT NULL,
  project_id         TEXT,
  mom_number         VARCHAR(40) NOT NULL,
  title              VARCHAR(255) NOT NULL,
  meeting_date       TIMESTAMPTZ NOT NULL,
  duration_minutes   INTEGER,
  location           VARCHAR(255),
  recording_url      TEXT,
  summary            TEXT,
  ai_summary         TEXT,
  visibility         VARCHAR(20) NOT NULL DEFAULT 'client',
  status             VARCHAR(20) NOT NULL DEFAULT 'published',
  created_by_user_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_moms_visibility_check
    CHECK (visibility IN ('internal','client')),
  CONSTRAINT portal_moms_status_check
    CHECK (status IN ('draft','published','archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_moms_tenant_number_uniq
  ON portal_moms (tenant_id, mom_number);
CREATE INDEX IF NOT EXISTS portal_moms_client_idx
  ON portal_moms (tenant_id, client_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS portal_moms_project_idx
  ON portal_moms (tenant_id, project_id);

CREATE TABLE IF NOT EXISTS portal_mom_counters (
  tenant_id TEXT PRIMARY KEY,
  last_seq  INTEGER NOT NULL DEFAULT 0
);

-- Attendees: free-text name + optional links to staff or portal user rows
-- (when the attendee is one of them).
CREATE TABLE IF NOT EXISTS portal_mom_attendees (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  mom_id          TEXT NOT NULL REFERENCES portal_moms(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  email           VARCHAR(255),
  role            VARCHAR(80),
  party           VARCHAR(20) NOT NULL DEFAULT 'client',
  staff_user_id   TEXT,
  portal_user_id  TEXT,
  position        INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT portal_mom_attendees_party_check
    CHECK (party IN ('client','internal','external'))
);

CREATE INDEX IF NOT EXISTS portal_mom_attendees_mom_idx
  ON portal_mom_attendees (mom_id);

CREATE TABLE IF NOT EXISTS portal_mom_decisions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL,
  mom_id      TEXT NOT NULL REFERENCES portal_moms(id) ON DELETE CASCADE,
  decision    TEXT NOT NULL,
  decided_by  VARCHAR(200),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_mom_decisions_mom_idx
  ON portal_mom_decisions (mom_id);

CREATE TABLE IF NOT EXISTS portal_mom_action_items (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                TEXT NOT NULL,
  mom_id                   TEXT NOT NULL REFERENCES portal_moms(id) ON DELETE CASCADE,
  text                     TEXT NOT NULL,
  owner_name               VARCHAR(200),
  owner_staff_user_id      TEXT,
  owner_portal_user_id     TEXT,
  due_date                 DATE,
  status                   VARCHAR(20) NOT NULL DEFAULT 'open',
  position                 INTEGER NOT NULL DEFAULT 0,
  -- Conversion tracking. Once an action item is turned into a ticket /
  -- change request, we remember what it became so the UI can link to it
  -- and we don't convert twice.
  converted_to_type        VARCHAR(20),
  converted_to_id          TEXT,
  converted_at             TIMESTAMPTZ,
  converted_by_user_id     TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_mom_action_items_status_check
    CHECK (status IN ('open','in_progress','done','cancelled','converted')),
  CONSTRAINT portal_mom_action_items_converted_type_check
    CHECK (converted_to_type IS NULL
           OR converted_to_type IN ('portal_ticket','ticket','change_request'))
);
CREATE INDEX IF NOT EXISTS portal_mom_action_items_mom_idx
  ON portal_mom_action_items (mom_id);
CREATE INDEX IF NOT EXISTS portal_mom_action_items_status_idx
  ON portal_mom_action_items (tenant_id, status);
