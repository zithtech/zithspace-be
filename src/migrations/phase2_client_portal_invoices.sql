-- =============================================================================
-- Client Portal — Phase 2 (Invoices)
-- Adds the missing CRM-client → billing-customer linkage, view tracking,
-- and client-uploaded payment-proof support.
--
-- All ID columns are TEXT to match the existing Prisma-managed schema
-- (`clients_v2`, `customers`, `invoices` all use text IDs).
-- =============================================================================

-- 1. Link a billing Customer to a CRM ClientV2. Nullable: many existing
--    customers won't have a CRM record. One CRM client can have several
--    billing customers (parent + subsidiaries).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE INDEX IF NOT EXISTS customers_client_id_idx
  ON customers (tenant_id, client_id);

-- 2. Track when a client portal user has viewed an invoice. Powers the
--    "Viewed" badge on the staff side and the "Last seen" timestamp.
CREATE TABLE IF NOT EXISTS invoice_portal_views (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  invoice_id      TEXT NOT NULL,
  portal_user_id  TEXT NOT NULL REFERENCES client_portal_users(id) ON DELETE CASCADE,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_count      INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_portal_views_uniq
  ON invoice_portal_views (invoice_id, portal_user_id);
CREATE INDEX IF NOT EXISTS invoice_portal_views_invoice_idx
  ON invoice_portal_views (tenant_id, invoice_id);

-- 3. Payment proof uploads by client portal users. Lives separately from
--    the existing `invoice_payments` table — staff must review and then
--    optionally promote a proof into an actual payment record.
CREATE TABLE IF NOT EXISTS invoice_payment_proofs (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id         TEXT NOT NULL,
  invoice_id        TEXT NOT NULL,
  portal_user_id    TEXT NOT NULL REFERENCES client_portal_users(id) ON DELETE SET NULL,
  amount            DECIMAL(15, 2),
  payment_date      DATE,
  reference         VARCHAR(255),
  note              TEXT,
  file_url          TEXT NOT NULL,
  file_name         VARCHAR(255),
  file_size_bytes   INTEGER,
  mime_type         VARCHAR(120),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_payment_proofs_status_check
    CHECK (status IN ('pending_review','approved','rejected'))
);

CREATE INDEX IF NOT EXISTS invoice_payment_proofs_invoice_idx
  ON invoice_payment_proofs (tenant_id, invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_payment_proofs_status_idx
  ON invoice_payment_proofs (tenant_id, status);
