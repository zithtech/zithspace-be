-- ============================================================================
-- Reimbursement 2.0 — claims, line items, receipts (migration 003)
--
-- A claim (aka expense report) is a header owned by one user with N line items,
-- each optionally carrying receipt attachments. Balances/limits are derived by
-- aggregating items across a period — no separate ledger table for the core flow.
--
-- Identity: keyed on user_id (matches leave-v2 and users.reports_to_id lookups).
-- Same two-layer tenant isolation as prior migrations. All tables `rb2_`.
-- ============================================================================

-- ─── rb2_claim_seq (per-tenant human-friendly claim numbers) ────────────────
CREATE TABLE IF NOT EXISTS rb2_claim_seq (
  tenant_id uuid PRIMARY KEY,
  last_no   bigint NOT NULL DEFAULT 0
);

-- ─── rb2_claims (header) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rb2_claims (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  user_id           uuid NOT NULL,
  claim_no          text NOT NULL,
  title             text,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'submitted', 'pending', 'approved',
                                        'rejected', 'paid', 'cancelled')),
  total_amount      numeric(14, 2) NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'INR',
  submitted_at      timestamptz,
  approver_id       uuid,
  decided_at        timestamptz,
  decision_note     text,
  paid_at           timestamptz,
  paid_by           uuid,
  payment_reference text,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rb2_claims_tenant_no
  ON rb2_claims (tenant_id, claim_no);

CREATE INDEX IF NOT EXISTS ix_rb2_claims_user_status
  ON rb2_claims (tenant_id, user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_rb2_claims_status
  ON rb2_claims (tenant_id, status)
  WHERE deleted_at IS NULL;

-- ─── rb2_claim_items (line items) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rb2_claim_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  claim_id     uuid NOT NULL REFERENCES rb2_claims (id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES rb2_expense_categories (id),
  expense_date date NOT NULL,
  merchant     text,
  bill_no      text,
  amount       numeric(12, 2) NOT NULL CHECK (amount > 0),
  tax_amount   numeric(12, 2) NOT NULL DEFAULT 0,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rb2_claim_items_claim
  ON rb2_claim_items (tenant_id, claim_id);

-- Period aggregation for limit checks (per user, per category, by date).
CREATE INDEX IF NOT EXISTS ix_rb2_claim_items_category_date
  ON rb2_claim_items (tenant_id, category_id, expense_date);

-- ─── rb2_claim_attachments (receipts) ───────────────────────────────────────
-- claim_item_id NULL = a claim-level receipt (not tied to a specific line).
CREATE TABLE IF NOT EXISTS rb2_claim_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  claim_id      uuid NOT NULL REFERENCES rb2_claims (id) ON DELETE CASCADE,
  claim_item_id uuid REFERENCES rb2_claim_items (id) ON DELETE CASCADE,
  file_name     text NOT NULL,
  file_url      text NOT NULL,
  file_size     bigint,
  file_type     text,
  uploaded_by   uuid,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rb2_claim_attachments_claim
  ON rb2_claim_attachments (tenant_id, claim_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- rb2_claim_seq is tenant-keyed by PK; guard it with RLS too.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rb2_claims', 'rb2_claim_items', 'rb2_claim_attachments', 'rb2_claim_seq']
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
