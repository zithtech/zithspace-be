-- Project Agreements — the company's signature image (migration 006)
--
-- Stored on the LETTERHEAD, not on the agreement. An authorised signature is a
-- company asset reused across every document, the same as the logo: putting a
-- copy on each agreement would mean changing signatory leaves old drafts
-- signed by someone who has left.
--
-- Only OUR side gets an image. The counterparty's slot stays blank — we do not
-- hold their signature, and printing one we invented would be forgery.

ALTER TABLE pa_branding
  ADD COLUMN IF NOT EXISTS signature_url text;
