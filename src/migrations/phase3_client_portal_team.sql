-- =============================================================================
-- Client Portal — Phase 3 (Team / Resource visibility)
--
-- Single-table module. Curated team-member list per client — separate from
-- the existing `employee_client_allocations_v2` which carries billing fields
-- the client must not see.
--
-- Staff picks who shows up, with what role label, contact info and bio.
-- Portal renders cards on /portal/team.
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_team_members (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id              TEXT NOT NULL,
  client_id              TEXT NOT NULL,
  project_id             TEXT,
  staff_user_id          TEXT,
  -- Snapshot/display fields. Default to staff user's name when present, but
  -- staff can override (e.g. preferred display name for client).
  display_name           VARCHAR(200) NOT NULL,
  role_label             VARCHAR(160) NOT NULL,
  discipline             VARCHAR(40),
  -- Contact overrides — fall back to users.work_email if NULL.
  contact_email          VARCHAR(255),
  contact_phone          VARCHAR(80),
  is_primary_contact     BOOLEAN NOT NULL DEFAULT FALSE,
  bio                    TEXT,
  availability_status    VARCHAR(20) NOT NULL DEFAULT 'available',
  availability_note      VARCHAR(255),
  is_visible             BOOLEAN NOT NULL DEFAULT TRUE,
  position               INTEGER NOT NULL DEFAULT 0,
  created_by_user_id     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_team_members_discipline_check
    CHECK (discipline IS NULL OR discipline IN (
      'engineering','design','qa','pm','account','devops','data','support','other'
    )),
  CONSTRAINT portal_team_members_availability_check
    CHECK (availability_status IN ('available','limited','away','unavailable'))
);

CREATE INDEX IF NOT EXISTS portal_team_members_client_idx
  ON portal_team_members (tenant_id, client_id, position ASC);
CREATE INDEX IF NOT EXISTS portal_team_members_project_idx
  ON portal_team_members (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS portal_team_members_staff_user_idx
  ON portal_team_members (tenant_id, staff_user_id)
  WHERE staff_user_id IS NOT NULL;
