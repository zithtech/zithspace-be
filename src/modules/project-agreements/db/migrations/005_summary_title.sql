-- Project Agreements — the summary Title is not the document name (migration 005)
--
-- The header's top-left carries the DOCUMENT NAME ("Master Services
-- Agreement"). The summary block's Title row was printing that same value, so
-- it restated the header rather than telling the reader anything.
--
-- They are now independent: Title is free to say what the agreement is FOR
-- ("Platform build and 12-month support") while the document name stays the
-- kind of instrument it is.
--
-- NULL falls back to the document name, so every existing agreement prints
-- exactly as it did before this migration.

ALTER TABLE pa_agreements
  ADD COLUMN IF NOT EXISTS summary_title text;
