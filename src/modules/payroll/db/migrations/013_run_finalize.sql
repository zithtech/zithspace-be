-- ============================================================================
-- Payroll 2.0 — Phase 3c: Finalize & Lock (migration 013)
--
-- An approved run can be FINALIZED → it becomes immutable (no item/LOP edits,
-- no delete, no re-submit — already enforced by status guards in the service).
-- A finalized run can then be marked PAID once disbursed. Both transitions are
-- timestamped and recorded in the pay_run_approvals audit log.
-- ============================================================================

ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS finalized_by uuid;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS paid_at      timestamptz;
ALTER TABLE pay_runs ADD COLUMN IF NOT EXISTS paid_by      uuid;

-- Allow 'finalized' / 'paid' actions in the audit log.
ALTER TABLE pay_run_approvals DROP CONSTRAINT IF EXISTS pay_run_approvals_action_check;
ALTER TABLE pay_run_approvals
  ADD CONSTRAINT pay_run_approvals_action_check
  CHECK (action IN ('submitted', 'approved', 'rejected', 'finalized', 'paid'));
