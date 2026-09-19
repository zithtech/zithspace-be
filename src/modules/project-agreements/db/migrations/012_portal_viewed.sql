-- Project Agreements — has the client actually seen it? (migration 012)
--
-- "Sent" and "read" are different facts and the second is the one people chase
-- up about. The invoice portal already draws this distinction (see
-- clientPortalInvoiceController.decorateStatus, which reports VIEWED on top of
-- SENT); agreements now carry the same signal.
--
-- Recorded on FIRST open only. A timestamp that moves every time the page is
-- refreshed answers "when did they last look", which nobody asked; "when did
-- this first reach a human" is the useful fact, and it is the one a chase-up
-- email is written against.

ALTER TABLE pa_agreements
  ADD COLUMN IF NOT EXISTS portal_viewed_at timestamptz;
