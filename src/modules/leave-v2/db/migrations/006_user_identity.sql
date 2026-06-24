-- ============================================================================
-- Leave 2.0 — key on user_id instead of employee_id (migration 006)
--
-- Reality check: in production data, users.employee_id is sparsely populated
-- and not unique (e.g. 24 active users → 1 distinct employee_id), so keying
-- leave on employee_id collapsed everyone to ~1 person. The reliable, unique,
-- always-present identity is the user id. So the ledger + requests now key on
-- user_id (resolved from / equal to users.id).
--
-- Dependent indexes (uq_lv2_ledger_accrual, ix_lv2_leave_requests_*) follow the
-- column rename automatically.
--
-- The existing rows were keyed by employee_id and are test/greenfield data —
-- their key meaning has changed, so we clear them for a clean slate.
-- ============================================================================

ALTER TABLE lv2_leave_ledger   RENAME COLUMN employee_id TO user_id;
ALTER TABLE lv2_leave_requests RENAME COLUMN employee_id TO user_id;

TRUNCATE lv2_leave_ledger;
TRUNCATE lv2_leave_requests;
