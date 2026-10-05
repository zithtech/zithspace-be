-- ============================================================================
-- Mail Templates — per-member signatures (migration 002)
--
-- One signature per member, not one per tenant: a signature carries the
-- sender's own name, position and number, so a shared one would sign every
-- colleague's mail with somebody else's details.
--
-- A member who has never saved one has NO ROW here. That absence is meaningful
-- — it is what lets the service hand back a signature built from their own
-- record (see placeholders.ts → buildDefaultSignature) instead of an empty
-- box, and it is what "Reset to my details" restores by deleting the row.
--
-- Tenant isolation = the FORCE'd RLS policy below plus an explicit
-- `tenant_id = $1` in every query; user scoping is a second explicit filter,
-- since RLS separates tenants but not colleagues.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mt_mail_signatures (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL,

  -- Sanitised HTML. May contain {{my_*}} placeholders, which resolve against
  -- the sender each time it is used, so a promotion does not need the
  -- signature rewritten.
  html       text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, user_id)
);

-- ─── Row Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mt_mail_signatures'] LOOP
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
