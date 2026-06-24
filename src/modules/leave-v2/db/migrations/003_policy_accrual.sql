-- ============================================================================
-- Leave 2.0 — term-based accrual on policies (migration 003)
--
-- Adds the configuration that drives term-based entitlement + Loss-of-Pay:
--
-- Policy level:
--   • term_cycle         — the bucket the entitlement operates/resets on:
--                          monthly | quarterly | half_yearly | yearly
--   • lop_on_exhaustion  — once the accrued balance for the period is used up,
--                          further leave is Loss of Pay (no borrowing ahead).
--
-- Line level (per leave type):
--   • accrual_method  — 'monthly'   : count_per_period accrues each month
--                       'term_total': count_per_period granted for the whole term
--   • count_per_period — the count for that method
--   (allocation stays as the derived total-per-term, set by the app.)
--
-- e.g. yearly term, SL monthly 1 + CL monthly 1 → 12 + 12 = 24/yr. Take both in
-- a month and a 3rd that month exceeds the accrued-to-date balance → LOP.
-- ============================================================================

ALTER TABLE lv2_leave_policies
  ADD COLUMN IF NOT EXISTS term_cycle        text    NOT NULL DEFAULT 'yearly',
  ADD COLUMN IF NOT EXISTS lop_on_exhaustion boolean NOT NULL DEFAULT true;

ALTER TABLE lv2_leave_policy_lines
  ADD COLUMN IF NOT EXISTS accrual_method   text          NOT NULL DEFAULT 'term_total',
  ADD COLUMN IF NOT EXISTS count_per_period numeric(8, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lv2_policies_term_cycle_chk') THEN
    ALTER TABLE lv2_leave_policies
      ADD CONSTRAINT lv2_policies_term_cycle_chk
      CHECK (term_cycle IN ('monthly', 'quarterly', 'half_yearly', 'yearly'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lv2_policy_lines_accrual_chk') THEN
    ALTER TABLE lv2_leave_policy_lines
      ADD CONSTRAINT lv2_policy_lines_accrual_chk
      CHECK (accrual_method IN ('monthly', 'term_total'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lv2_policy_lines_cpp_chk') THEN
    ALTER TABLE lv2_leave_policy_lines
      ADD CONSTRAINT lv2_policy_lines_cpp_chk
      CHECK (count_per_period >= 0);
  END IF;
END $$;
