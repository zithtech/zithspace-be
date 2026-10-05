-- Project Agreements — the summary block under the letterhead (migration 003)
--
-- A label/value block that prints between the header and the first clause:
--
--   Title                  Master Services Agreement
--   Client                 Globex Inc
--   Project Kick-off       1 Mar 2026
--   Total Project Value    INR 24,00,000
--   Client Contacts        legal@globex.com · +91 80 4567 8900
--   Date                   14 Sep 2026
--   Reference              AGR-2026-0001
--   Project                Orion Platform (ORN)
--
-- MOST OF IT IS ALREADY HERE. title, party_name, party_email, document_number,
-- project_name and effective_date all exist; this migration adds only the four
-- facts that had nowhere to live, plus the list of which rows to print.
--
-- summary_fields NULL means "print them all". That is deliberate rather than
-- backfilling every existing row with the full list: the default should follow
-- the product, so adding a ninth row later shows up on old agreements too
-- instead of only on ones created after today.

ALTER TABLE pa_agreements
  -- The date ON the document, which is not the date it takes effect. A contract
  -- signed in September can commence in December, and both belong in the block.
  ADD COLUMN IF NOT EXISTS document_date  date,
  ADD COLUMN IF NOT EXISTS kickoff_date   date,
  -- numeric, not text: this is money, and a contract value that cannot be
  -- summed or compared is a string pretending to be one.
  ADD COLUMN IF NOT EXISTS total_value    numeric(15, 2),
  ADD COLUMN IF NOT EXISTS value_currency text,
  ADD COLUMN IF NOT EXISTS party_phone    text,
  -- Which rows this document prints, in the product's own order. NULL = all.
  ADD COLUMN IF NOT EXISTS summary_fields text[];
