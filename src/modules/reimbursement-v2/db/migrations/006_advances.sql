-- ============================================================================
-- Reimbursement 2.0 — cash advances + reconciliation (migration 007)
--
-- An advance is money paid to an employee BEFORE expenses are incurred. It runs
-- its own request → approve → pay flow (reporting manager → finance, mirroring
-- claims). Actual claims are later linked back to an advance via
-- rb2_claims.advance_id; the advance's reconciled_amount is the sum of its
-- linked PAID claims, and outstanding = amount − reconciled_amount.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rb2_advance_seq (
  tenant_id uuid PRIMARY KEY,
  last_no   bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rb2_advances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  user_id           uuid NOT NULL,
  advance_no        text NOT NULL,
  purpose           text,
  amount            numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency          text NOT NULL DEFAULT 'INR',
  needed_by         date,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'paid',
                                        'partially_reconciled', 'reconciled', 'cancelled')),
  approver_id       uuid,
  decided_at        timestamptz,
  decision_note     text,
  paid_at           timestamptz,
  paid_by           uuid,
  payment_reference text,
  reconciled_amount numeric(14, 2) NOT NULL DEFAULT 0,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rb2_advances_tenant_no
  ON rb2_advances (tenant_id, advance_no);

CREATE INDEX IF NOT EXISTS ix_rb2_advances_user_status
  ON rb2_advances (tenant_id, user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_rb2_advances_status
  ON rb2_advances (tenant_id, status)
  WHERE deleted_at IS NULL;

-- Link a claim to the advance it settles (nullable).
ALTER TABLE rb2_claims
  ADD COLUMN IF NOT EXISTS advance_id uuid REFERENCES rb2_advances (id);

CREATE INDEX IF NOT EXISTS ix_rb2_claims_advance
  ON rb2_claims (tenant_id, advance_id)
  WHERE advance_id IS NOT NULL;

-- ─── Row-Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rb2_advances', 'rb2_advance_seq']
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
