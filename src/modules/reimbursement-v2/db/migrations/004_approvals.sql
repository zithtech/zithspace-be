-- ============================================================================
-- Reimbursement 2.0 — approval audit trail (migration 004)
--
-- Append-only log of every workflow action on a claim (submit / approve /
-- reject / send-back / paid / cancel). The current claim status lives on
-- rb2_claims; this table is the immutable history behind it. Never UPDATE or
-- DELETE rows here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rb2_claim_approvals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  claim_id   uuid NOT NULL REFERENCES rb2_claims (id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL,
  action     text NOT NULL
               CHECK (action IN ('submitted', 'approved', 'rejected',
                                 'sent_back', 'paid', 'cancelled')),
  remarks    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rb2_claim_approvals_claim
  ON rb2_claim_approvals (tenant_id, claim_id, created_at);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rb2_claim_approvals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;
