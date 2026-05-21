-- =============================================================================
-- Client Portal — Phase 3 (Approvals)
--
-- Generic approval engine for things like: designs, requirements, sprint
-- signoff, UAT, production releases, invoices, etc. Each approval request
-- can have multiple approvers; rollup status is computed by the controller
-- but persisted on the request row to keep list queries fast.
--
-- Note: Change Requests have their own native approve/reject flow (the
-- estimate approval). This module is for everything else.
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_approval_requests (
  id                           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                    TEXT NOT NULL,
  client_id                    TEXT NOT NULL,
  project_id                   TEXT,
  approval_number              VARCHAR(40) NOT NULL,

  -- Polymorphic subject
  subject_type                 VARCHAR(30) NOT NULL,
  subject_id                   TEXT,
  subject_label                VARCHAR(255),

  title                        VARCHAR(255) NOT NULL,
  description                  TEXT,
  preview_url                  TEXT,

  status                       VARCHAR(20) NOT NULL DEFAULT 'open',
  due_date                     TIMESTAMPTZ,
  expires_at                   TIMESTAMPTZ,

  requested_by_staff_user_id   TEXT,
  last_activity_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT portal_approval_requests_subject_type_check
    CHECK (subject_type IN (
      'design','requirement','sprint','uat','production_release',
      'cr','invoice','document','custom'
    )),
  CONSTRAINT portal_approval_requests_status_check
    CHECK (status IN ('open','approved','rejected','cancelled','expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_approval_requests_tenant_number_uniq
  ON portal_approval_requests (tenant_id, approval_number);
CREATE INDEX IF NOT EXISTS portal_approval_requests_client_idx
  ON portal_approval_requests (tenant_id, client_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS portal_approval_requests_status_idx
  ON portal_approval_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS portal_approval_requests_subject_idx
  ON portal_approval_requests (tenant_id, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS portal_approval_counters (
  tenant_id TEXT PRIMARY KEY,
  last_seq  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS portal_approval_approvers (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  approval_id     TEXT NOT NULL REFERENCES portal_approval_requests(id) ON DELETE CASCADE,
  approver_type   VARCHAR(10) NOT NULL,
  portal_user_id  TEXT,
  staff_user_id   TEXT,
  required        BOOLEAN NOT NULL DEFAULT TRUE,
  decision        VARCHAR(20),
  decision_note   TEXT,
  decided_at      TIMESTAMPTZ,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_approval_approvers_type_check
    CHECK (approver_type IN ('portal','staff')),
  CONSTRAINT portal_approval_approvers_decision_check
    CHECK (decision IS NULL OR decision IN ('approved','rejected'))
);

CREATE INDEX IF NOT EXISTS portal_approval_approvers_approval_idx
  ON portal_approval_approvers (approval_id);
CREATE INDEX IF NOT EXISTS portal_approval_approvers_portal_user_idx
  ON portal_approval_approvers (tenant_id, portal_user_id)
  WHERE portal_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS portal_approval_approvers_staff_user_idx
  ON portal_approval_approvers (tenant_id, staff_user_id)
  WHERE staff_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal_approval_attachments (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id               TEXT NOT NULL,
  approval_id             TEXT NOT NULL REFERENCES portal_approval_requests(id) ON DELETE CASCADE,
  file_name               VARCHAR(255) NOT NULL,
  file_url                TEXT NOT NULL,
  file_size_bytes         INTEGER,
  mime_type               VARCHAR(120),
  uploaded_by_type        VARCHAR(10) NOT NULL,
  uploaded_by_staff_user_id TEXT,
  uploaded_by_portal_id     TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_approval_attachments_uploaded_by_check
    CHECK (uploaded_by_type IN ('staff','portal'))
);
CREATE INDEX IF NOT EXISTS portal_approval_attachments_approval_idx
  ON portal_approval_attachments (approval_id);

-- Audit / activity log
CREATE TABLE IF NOT EXISTS portal_approval_events (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id         TEXT NOT NULL,
  approval_id       TEXT NOT NULL REFERENCES portal_approval_requests(id) ON DELETE CASCADE,
  event_type        VARCHAR(40) NOT NULL,
  actor_type        VARCHAR(10),  -- 'staff' | 'portal' | 'system' | NULL
  actor_staff_user_id  TEXT,
  actor_portal_id      TEXT,
  payload           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_approval_events_approval_idx
  ON portal_approval_events (approval_id, created_at ASC);
