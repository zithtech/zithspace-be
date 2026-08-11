-- ============================================================================
-- Company Details — add the company website URL (migration 002)
--
-- Stored normalised (always carrying a scheme) so the frontend can render it
-- straight into an <a href> without re-deriving one.
-- ============================================================================

ALTER TABLE cd_company_details
  ADD COLUMN IF NOT EXISTS website text;
