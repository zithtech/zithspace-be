-- =============================================================================
-- Client Portal — Phase 3 (Change Requests)
--
-- A change request is a formal "we want to add/change scope" item with:
--   - description (what)
--   - impact analysis (staff-authored)
--   - time + cost estimate (staff-authored, hours + currency amount)
--   - approval flow (client signs off the estimate)
--   - linked invoice (the bill for this scope)
--   - linked sprint (delivery scheduling)
--
-- Conversation thread mirrors portal_ticket_messages — system events log
-- status changes, estimate posts, approvals, links, etc.
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_change_requests (
  id                            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                     TEXT NOT NULL,
  client_id                     TEXT NOT NULL,
  project_id                    TEXT,
  cr_number                     VARCHAR(40) NOT NULL,
  subject                       VARCHAR(255) NOT NULL,
  description                   TEXT,
  priority                      VARCHAR(20) NOT NULL DEFAULT 'medium',
  status                        VARCHAR(30) NOT NULL DEFAULT 'submitted',

  -- Estimate (set by staff)
  impact_analysis               TEXT,
  estimated_hours_min           DECIMAL(8, 2),
  estimated_hours_max           DECIMAL(8, 2),
  estimated_cost                DECIMAL(15, 2),
  estimated_currency            VARCHAR(10),
  target_delivery_date          DATE,

  -- Client decision
  client_decision               VARCHAR(20), -- 'approved' | 'rejected' | NULL
  client_decision_at            TIMESTAMPTZ,
  client_decision_by_portal_id  TEXT REFERENCES client_portal_users(id) ON DELETE SET NULL,
  client_decision_note          TEXT,

  -- Links
  linked_invoice_id             TEXT,
  linked_sprint_id              TEXT,
  source_mom_action_item_id     TEXT,

  -- Authorship + assignment
  created_by_portal_user_id     TEXT REFERENCES client_portal_users(id) ON DELETE SET NULL,
  created_by_staff_user_id      TEXT,
  assigned_staff_user_id        TEXT,

  last_activity_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT portal_change_requests_priority_check
    CHECK (priority IN ('low','medium','high','critical')),
  CONSTRAINT portal_change_requests_status_check
    CHECK (status IN (
      'draft','submitted','under_review','estimated','approved','rejected',
      'scheduled','in_progress','delivered','closed','cancelled'
    )),
  CONSTRAINT portal_change_requests_decision_check
    CHECK (client_decision IS NULL OR client_decision IN ('approved','rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_change_requests_tenant_number_uniq
  ON portal_change_requests (tenant_id, cr_number);
CREATE INDEX IF NOT EXISTS portal_change_requests_client_idx
  ON portal_change_requests (tenant_id, client_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS portal_change_requests_status_idx
  ON portal_change_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS portal_change_requests_assigned_idx
  ON portal_change_requests (tenant_id, assigned_staff_user_id);

CREATE TABLE IF NOT EXISTS portal_cr_counters (
  tenant_id TEXT PRIMARY KEY,
  last_seq  INTEGER NOT NULL DEFAULT 0
);

-- Conversation + audit thread. Same shape as portal_ticket_messages so we can
-- reuse the same FE rendering patterns.
CREATE TABLE IF NOT EXISTS portal_cr_messages (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id          TEXT NOT NULL,
  cr_id              TEXT NOT NULL REFERENCES portal_change_requests(id) ON DELETE CASCADE,
  author_type        VARCHAR(10) NOT NULL,
  portal_user_id     TEXT,
  staff_user_id      TEXT,
  body               TEXT,
  attachments        JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system_event    BOOLEAN NOT NULL DEFAULT FALSE,
  event_type         VARCHAR(40),
  event_from         TEXT,
  event_to           TEXT,
  metadata           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_cr_messages_author_check
    CHECK (author_type IN ('portal','staff','system'))
);

CREATE INDEX IF NOT EXISTS portal_cr_messages_cr_idx
  ON portal_cr_messages (tenant_id, cr_id, created_at ASC);
