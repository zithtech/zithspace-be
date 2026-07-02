-- ============================================================================
-- Leave 2.0 — withdrawal of an already-approved leave (migration 010)
--
-- Edge case: an employee is approved for N days but only takes some (or none)
-- of them and wants to release the rest back to their balance. Since the
-- balance debit already landed at approval time, releasing days must credit the
-- ledger back — but only for the PAID portion actually released (LOP days were
-- never debited, so they carry no balance impact).
--
-- Flow = a second, lightweight approval cycle on the same request:
--   employee submits a withdrawal request → the requester's manager confirms.
-- Nothing hits the ledger until the manager confirms.
--
--   withdrawal_status:
--     NULL        — no withdrawal in play (default)
--     'requested' — employee asked to release days; awaiting the manager
--     'confirmed' — manager confirmed; ledger credited, request finalised
--     'declined'  — manager declined; request unchanged, can be re-requested
--
-- On confirm:
--   • full release   → status becomes 'withdrawn', actual_units = 0
--   • partial (shorten) → status stays 'approved', to_date/total/paid/lop are
--     reduced to what was actually taken; actual_units mirrors the new total.
-- total_units always stays consistent with the effective (post-withdrawal)
-- record; the original approved figures live in the activity history snapshot.
-- ============================================================================

-- Allow the new terminal state for a fully-withdrawn leave.
ALTER TABLE lv2_leave_requests DROP CONSTRAINT IF EXISTS lv2_leave_requests_status_check;
ALTER TABLE lv2_leave_requests
  ADD CONSTRAINT lv2_leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'withdrawn'));

ALTER TABLE lv2_leave_requests
  ADD COLUMN IF NOT EXISTS actual_units               numeric(6, 2),
  ADD COLUMN IF NOT EXISTS withdrawal_status          text
    CHECK (withdrawal_status IN ('requested', 'confirmed', 'declined')),
  ADD COLUMN IF NOT EXISTS withdrawal_requested_units numeric(6, 2),
  ADD COLUMN IF NOT EXISTS withdrawal_new_to_date     date,
  ADD COLUMN IF NOT EXISTS withdrawal_reason          text,
  ADD COLUMN IF NOT EXISTS withdrawal_decided_by      uuid,
  ADD COLUMN IF NOT EXISTS withdrawal_decided_at      timestamptz;

-- Surface pending withdrawal requests to approvers quickly.
CREATE INDEX IF NOT EXISTS ix_lv2_leave_requests_withdrawal
  ON lv2_leave_requests (tenant_id, withdrawal_status)
  WHERE withdrawal_status IS NOT NULL;
