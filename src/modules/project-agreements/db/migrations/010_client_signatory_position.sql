-- Project Agreements — the counterparty's signing authority (migration 010)
--
-- Our side of the sign-off has always printed "Name - Position"; theirs printed
-- a bare name. That asymmetry was never deliberate — the authority somebody
-- signs under matters more on the side you do NOT control, because it is the
-- only thing on the page saying the person who signed could bind the company.
--
-- NULL on every existing document, and the renderer drops the dash cleanly
-- when there is no position, so nothing already signed changes.

ALTER TABLE pa_agreements
  ADD COLUMN IF NOT EXISTS client_signatory_position text;
