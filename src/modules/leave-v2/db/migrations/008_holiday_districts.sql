-- ============================================================================
-- Leave 2.0 — district-level (Local) holidays (migration 008)
--
-- Adds a districts array for 'Local' holidays. Coverage now nests:
--   Country (country) → State (states[]) → District (districts[])
--   • National  → states = {ALL}, districts = {}
--   • State     → states = picked, districts = {}
--   • Local     → states = parent state(s), districts = picked
-- ============================================================================

ALTER TABLE lv2_holidays
  ADD COLUMN IF NOT EXISTS districts text[] NOT NULL DEFAULT '{}';

-- Allow the new 'Local' type (type is a free text column; no enum constraint).
