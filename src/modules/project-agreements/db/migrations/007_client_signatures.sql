-- Project Agreements — client signatures (migration 007)

ALTER TABLE pa_agreements
  ADD COLUMN IF NOT EXISTS client_signature_url text,
  ADD COLUMN IF NOT EXISTS client_signed_at timestamptz;
