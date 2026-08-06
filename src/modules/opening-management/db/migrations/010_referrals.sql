-- ============================================================================
-- Opening Management — Referrals holding area (migration 010)
--
-- Referrals submitted by employees are held here before they are "Considered 
-- as Candidate" (which pushes them to the pipeline and creates an Application).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS om_referrals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  opening_id       uuid NOT NULL REFERENCES om_openings (id) ON DELETE CASCADE,
  
  -- users.id of the referrer
  referred_by      text NOT NULL,

  -- Candidate Details
  name             text NOT NULL,
  email            text NOT NULL,
  mobile           text NOT NULL,
  
  -- Resume parsed details
  resume_url       text,
  notes            text,
  skills           jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_experience numeric NOT NULL DEFAULT 0,

  -- Status
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'converted', 'rejected')),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_om_referrals_opening
  ON om_referrals (tenant_id, opening_id, status);

CREATE INDEX IF NOT EXISTS ix_om_referrals_referrer
  ON om_referrals (tenant_id, referred_by);

-- Row-Level Security
ALTER TABLE om_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE om_referrals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON om_referrals;

CREATE POLICY tenant_isolation ON om_referrals
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
