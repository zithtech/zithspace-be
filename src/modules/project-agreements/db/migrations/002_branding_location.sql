-- Project Agreements — add the letterhead's location line (migration 002)
--
-- The footer now carries four contacts rather than three: phone, email,
-- website and WHERE THE COMPANY IS ("Chennai-91, India"). A single free-text
-- line rather than structured address columns, because this is a printed
-- footer, not an address to post to — cd_company_details already models the
-- registered address properly, and duplicating its ten columns here would
-- invite the two to disagree about which one the letterhead shows.

ALTER TABLE pa_branding
  ADD COLUMN IF NOT EXISTS location text;
