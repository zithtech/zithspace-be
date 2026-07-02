-- Extends the lead source discriminator with a third kind: 'intake'.
-- Lead Intake captures a full company profile plus multiple decision-maker
-- contacts. The company-side fields reuse the existing columns added for
-- website inquiries; the intake-specific fields and the decision_makers[]
-- array live in the leads.form_data JSONB column.

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_source_kind_check;

ALTER TABLE leads
    ADD CONSTRAINT leads_lead_source_kind_check
        CHECK (lead_source_kind IN ('platform', 'website', 'intake'));
