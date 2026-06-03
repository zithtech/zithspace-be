-- Transaction history (cross-module audit log).
-- Append-only. One row per user-visible mutation (create / update / delete).
-- Reads (GET) are NOT logged.
--
-- Hierarchy mirrors the FE nav:
--   section  (top navbar)  -> module (side menu)  -> page (route).
-- These values are declared by the controller at the call site (not inferred
-- from the URL) so that renaming a route does not break history continuity.
--
-- PII scrubbing: keys matching /password|passwd|token|secret|authorization|api[_-]?key/i
-- in before_data / after_data / metadata are replaced with '[REDACTED]'
-- by the JS helper before insert (see src/utils/transactionHistory.ts).

CREATE TABLE IF NOT EXISTS transaction_history (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL,

  -- Navigation hierarchy
  section             TEXT NOT NULL,           -- WORK | HR | FINANCE | SETTINGS | CLIENT_PORTAL ...
  module              TEXT NOT NULL,           -- Tickets | BugList | Invoices | Leaves ...
  page                TEXT,                    -- TicketList | TicketDetail | KanbanView ...

  -- What happened
  action              TEXT NOT NULL,           -- create | update | delete
                                               -- | bulk_update_status | bulk_archive | bulk_unarchive | bulk_delete
                                               -- | status_change | assign | convert | ...
  action_label        TEXT,                    -- short human string: "Moved ticket to Done"

  -- What it acted on
  entity_type         TEXT,                    -- ticket | bug | invoice | ...
  entity_id           TEXT,                    -- id of the affected row (no FK on purpose, survives deletes)
  entity_label        TEXT,                    -- snapshot, e.g. "TKT-123 — login broken"
  parent_entity_type  TEXT,                    -- optional, e.g. ticket's project
  parent_entity_id    TEXT,

  -- Who
  actor_id            TEXT NOT NULL,
  actor_type          TEXT NOT NULL DEFAULT 'staff', -- staff | client_portal | system | api_key
  actor_email         TEXT,                    -- snapshot
  actor_name          TEXT,                    -- snapshot
  impersonator_id     TEXT,

  -- State change (controller fills these in for updates / deletes)
  before_data         JSONB,
  after_data          JSONB,
  changed_fields      TEXT[],                  -- pre-computed list of keys that differ

  -- Request context (filled by helper from req)
  request_method      TEXT,                    -- POST | PUT | PATCH | DELETE
  request_path        TEXT,                    -- /api/tickets/:id  (route pattern, not raw url)
  status_code         INT,
  duration_ms         INT,
  ip_address          TEXT,
  user_agent          TEXT,

  -- Correlation
  session_id          TEXT,
  correlation_id      TEXT,                    -- group rows from one logical op (bulk update, multi-step wizard)
  source              TEXT NOT NULL DEFAULT 'web', -- web | mobile | api | system_job | webhook

  -- Free-form bag for module-specific extras (filters used, batch size, ai model name, ...)
  metadata            JSONB,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline view per tenant (most common query)
CREATE INDEX IF NOT EXISTS transaction_history_tenant_time_idx
  ON transaction_history (tenant_id, created_at DESC);

-- Filter by hierarchy
CREATE INDEX IF NOT EXISTS transaction_history_tenant_section_module_idx
  ON transaction_history (tenant_id, section, module, created_at DESC);

-- "Who did what"
CREATE INDEX IF NOT EXISTS transaction_history_tenant_actor_idx
  ON transaction_history (tenant_id, actor_id, created_at DESC);

-- "Show history of this entity"
CREATE INDEX IF NOT EXISTS transaction_history_tenant_entity_idx
  ON transaction_history (tenant_id, entity_type, entity_id, created_at DESC);

-- "Show me all deletes / all bulk ops"
CREATE INDEX IF NOT EXISTS transaction_history_tenant_action_idx
  ON transaction_history (tenant_id, action, created_at DESC);

-- Group bulk / multi-step ops
CREATE INDEX IF NOT EXISTS transaction_history_correlation_idx
  ON transaction_history (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Append-only guardrails
CREATE OR REPLACE FUNCTION transaction_history_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'transaction_history is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transaction_history_no_update ON transaction_history;
CREATE TRIGGER transaction_history_no_update
  BEFORE UPDATE ON transaction_history
  FOR EACH ROW EXECUTE FUNCTION transaction_history_block_mutation();

DROP TRIGGER IF EXISTS transaction_history_no_delete ON transaction_history;
CREATE TRIGGER transaction_history_no_delete
  BEFORE DELETE ON transaction_history
  FOR EACH ROW EXECUTE FUNCTION transaction_history_block_mutation();
