-- ============================================================================
-- Reimbursement 2.0 — multi-currency + mileage (migration 005)
--
-- Adds columns to existing rb2_ tables (RLS already in force on them):
--   * claims: exchange rate to the org base currency + derived base_amount, so
--     finance/reports can aggregate mixed-currency claims in one number.
--   * categories: a `kind` discriminator — 'amount' (normal) or 'mileage'
--     (distance-based), plus the per-unit rate and unit label.
--   * claim items: `distance` for mileage items (amount is derived = distance ×
--     category.mileage_rate, computed server-side at add/update time).
-- ============================================================================

ALTER TABLE rb2_claims
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(14, 6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS base_amount   numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE rb2_expense_categories
  ADD COLUMN IF NOT EXISTS kind         text NOT NULL DEFAULT 'amount'
                             CHECK (kind IN ('amount', 'mileage')),
  ADD COLUMN IF NOT EXISTS mileage_rate numeric(10, 2),   -- base-currency per unit
  ADD COLUMN IF NOT EXISTS mileage_unit text;             -- e.g. 'km', 'mile'

ALTER TABLE rb2_claim_items
  ADD COLUMN IF NOT EXISTS distance numeric(10, 2);       -- for mileage items
