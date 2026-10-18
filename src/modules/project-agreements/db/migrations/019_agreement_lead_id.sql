-- Project Agreements — link to leads (migration 019)
--
-- Adds lead_id to pa_agreements so an agreement generated from a lead
-- stays linked to that lead, allowing the leads table and detail views
-- to display "View Agreement" and link directly to it.

ALTER TABLE pa_agreements
  ADD COLUMN IF NOT EXISTS lead_id uuid;

CREATE INDEX IF NOT EXISTS pa_agreements_lead_idx
  ON pa_agreements (tenant_id, lead_id) WHERE deleted_at IS NULL AND lead_id IS NOT NULL;
