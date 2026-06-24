-- ============================================================================
-- Leave 2.0 — paid / LOP split on leave requests (migration 005)
--
-- A request's total_units splits into:
--   • paid_units — covered by available balance (debited from the ledger)
--   • lop_units  — beyond balance → Loss of Pay (does NOT debit the ledger)
--
-- Computed at apply time (preview against current balance) and finalised at
-- approval. total_units = paid_units + lop_units.
-- ============================================================================

ALTER TABLE lv2_leave_requests
  ADD COLUMN IF NOT EXISTS paid_units numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lop_units  numeric(6, 2) NOT NULL DEFAULT 0;
