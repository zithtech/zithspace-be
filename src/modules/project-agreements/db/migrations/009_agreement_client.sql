-- Project Agreements — the client a document is addressed to (migration 009)
--
-- The composer took a counterparty as free text: you typed the name, the email
-- and the phone, on every document, for a client already recorded in the
-- Clients module with its contacts. Three chances to mistype an address on a
-- contract.
--
-- The picker now links the client and the contact, and SNAPSHOTS what it used
-- (client_company, and the existing party_* columns). The ids are the link for
-- reopening the composer; the snapshot is what prints, so renaming a client or
-- deleting a contact never rewrites a document somebody already signed — the
-- same rule project_name and project_code follow.
--
-- No foreign key, deliberately: clients_v2 belongs to another module, and an
-- agreement must outlive the deletion of the contact it was addressed to.

ALTER TABLE pa_agreements
  ADD COLUMN IF NOT EXISTS client_id         text,
  ADD COLUMN IF NOT EXISTS client_company    text,
  ADD COLUMN IF NOT EXISTS client_contact_id text;

CREATE INDEX IF NOT EXISTS pa_agreements_client_idx
  ON pa_agreements (tenant_id, client_id) WHERE deleted_at IS NULL;
