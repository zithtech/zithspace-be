-- ============================================================================
-- Mail Templates — initial schema (migration 001)
--
-- One table: mt_mail_templates — reusable emails a tenant writes once and
-- sends many times from /mail. The body is sanitised HTML produced by the
-- Tiptap editor and may contain {{placeholders}} which are substituted per
-- recipient at send time (see ../placeholders.ts for the catalogue).
--
-- Tenant isolation = two independent layers:
--   1. The RLS policy below (FORCE'd, so even the table owner is bound by it).
--   2. Explicit `tenant_id = $1` filters in every repository query.
-- The app sets `app.current_tenant_id` per transaction via withTenant().
--
-- DEFAULT TEMPLATE:
--   At most one template per tenant may be the default (the one Compose offers
--   first). That is enforced by a partial UNIQUE index rather than application
--   code, so two concurrent "make this the default" clicks cannot both win.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS mt_mail_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,

  name        text NOT NULL,
  subject     text NOT NULL,
  -- Sanitised HTML. Stored as written, placeholders included.
  body        text NOT NULL,
  -- Free-text grouping shown as a chip in the list ("Client", "Internal", …).
  category    text,

  is_default  boolean NOT NULL DEFAULT false,

  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Names are how people pick a template out of a list, so they must be
-- distinguishable — case-insensitively, within the tenant.
CREATE UNIQUE INDEX IF NOT EXISTS mt_mail_templates_tenant_name_uniq
  ON mt_mail_templates (tenant_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS mt_mail_templates_one_default
  ON mt_mail_templates (tenant_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS mt_mail_templates_tenant_idx
  ON mt_mail_templates (tenant_id, updated_at DESC);

-- ─── Row Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mt_mail_templates'] LOOP
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
