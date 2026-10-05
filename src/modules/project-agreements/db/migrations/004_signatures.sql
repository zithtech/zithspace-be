-- Project Agreements — the sign-off block (migration 004)
--
-- Two columns at the foot of the document:
--
--   For Zithtech                     For Globex Inc
--   ________________                 ________________
--   Signature                        Signature
--   Name      Bharathi               Name      ____________
--   Position  Director
--
-- ASYMMETRIC ON PURPOSE. Our side names the person AND their authority to
-- bind the company; the counterparty's side carries a name and a place to
-- sign, because we do not get to assert someone else's job title on a contract
-- they have not signed yet.
--
-- Every field is optional. An empty one prints a rule to complete by hand
-- rather than a blank — a contract that goes out for wet signature usually
-- wants exactly that.

ALTER TABLE pa_agreements
  -- Our signatory.
  ADD COLUMN IF NOT EXISTS signatory_name        text,
  ADD COLUMN IF NOT EXISTS signatory_position    text,
  -- Theirs. Falls back to party_name at render time when left blank, since the
  -- client is usually the one signing.
  ADD COLUMN IF NOT EXISTS client_signatory_name text,
  -- Not every document needs signing off — an internal change note, say.
  ADD COLUMN IF NOT EXISTS show_signatures       boolean NOT NULL DEFAULT true;
