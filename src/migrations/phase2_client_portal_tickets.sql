-- =============================================================================
-- Client Portal — Phase 2 (Support Tickets)
--
-- Distinct from the engineering `tickets` table. These are customer-raised
-- support tickets with their own status workflow, SLA, and conversation
-- thread (portal user ↔ staff user).
--
-- Why separate: `tickets.created_by_id` is a NOT-NULL FK to `users` (staff),
-- so we cannot insert portal-authored rows there. A dedicated table also
-- gives us the support-specific category taxonomy and SLA semantics the
-- spec calls for, without polluting engineering work items.
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_tickets (
  id                            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                     TEXT NOT NULL,
  client_id                     TEXT NOT NULL,
  ticket_number                 VARCHAR(40) NOT NULL,
  subject                       VARCHAR(255) NOT NULL,
  category                      VARCHAR(40) NOT NULL,
  priority                      VARCHAR(20) NOT NULL DEFAULT 'medium',
  status                        VARCHAR(30) NOT NULL DEFAULT 'new',
  project_id                    TEXT,
  created_by_portal_user_id     TEXT REFERENCES client_portal_users(id) ON DELETE SET NULL,
  assigned_staff_user_id        TEXT,
  due_date                      TIMESTAMPTZ,
  first_response_at             TIMESTAMPTZ,
  resolved_at                   TIMESTAMPTZ,
  closed_at                     TIMESTAMPTZ,
  sla_response_target_minutes   INTEGER,
  sla_resolution_target_minutes INTEGER,
  last_activity_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_tickets_category_check
    CHECK (category IN ('bug','enhancement','support','infra','access','other')),
  CONSTRAINT portal_tickets_priority_check
    CHECK (priority IN ('low','medium','high','critical')),
  CONSTRAINT portal_tickets_status_check
    CHECK (status IN ('new','in_review','in_progress','waiting_on_client','resolved','closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_tickets_tenant_number_uniq
  ON portal_tickets (tenant_id, ticket_number);
CREATE INDEX IF NOT EXISTS portal_tickets_client_idx
  ON portal_tickets (tenant_id, client_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS portal_tickets_status_idx
  ON portal_tickets (tenant_id, status);
CREATE INDEX IF NOT EXISTS portal_tickets_assigned_idx
  ON portal_tickets (tenant_id, assigned_staff_user_id);

-- Per-tenant monotonic ticket number sequence. We allocate from this in the
-- create endpoint to produce PT-000001 style numbers without collisions.
CREATE TABLE IF NOT EXISTS portal_ticket_counters (
  tenant_id TEXT PRIMARY KEY,
  last_seq  INTEGER NOT NULL DEFAULT 0
);

-- Conversation thread. One row per message OR per system event (status
-- change, assignment). Attachments live as a JSONB array of
-- { fileName, fileUrl, fileSize, mimeType }.
CREATE TABLE IF NOT EXISTS portal_ticket_messages (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id          TEXT NOT NULL,
  ticket_id          TEXT NOT NULL REFERENCES portal_tickets(id) ON DELETE CASCADE,
  author_type        VARCHAR(10) NOT NULL,
  portal_user_id     TEXT,
  staff_user_id      TEXT,
  body               TEXT,
  attachments        JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system_event    BOOLEAN NOT NULL DEFAULT FALSE,
  event_type         VARCHAR(40),
  event_from         TEXT,
  event_to           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_ticket_messages_author_check
    CHECK (author_type IN ('portal','staff','system'))
);

CREATE INDEX IF NOT EXISTS portal_ticket_messages_ticket_idx
  ON portal_ticket_messages (tenant_id, ticket_id, created_at ASC);
