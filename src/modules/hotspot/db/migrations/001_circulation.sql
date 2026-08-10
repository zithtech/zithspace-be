-- ============================================================================
-- Hotspot — Circulation schema (migration 001)
--
-- Circulation is the Hotspot noticeboard: any employee posts an important
-- update as rich text plus any number of images and documents, and the whole
-- tenant reads it. Two tables — the post and its attachments.
--
-- Pure raw-SQL module. These tables are NOT in schema.prisma and are managed
-- exclusively by the hotspot migration runner. All tables are prefixed `hs_`.
--
-- Tenant isolation = two independent layers:
--   1. RLS policies below (FORCE'd, so even the table owner is bound by them).
--   2. Explicit `tenant_id = $1` filters in every repository query.
-- The app sets `app.current_tenant_id` per transaction via withTenant().
--
-- ID TYPE NOTE — read before adding columns:
--   `tenant_id` and ids of our own rows are uuid. Ids pointing at Prisma-owned
--   tables (users.id) are stored as `text`, because Prisma stores String ids as
--   text and not all of them are uuids — text also lets us LEFT JOIN those
--   tables without a cast. No foreign keys point at Prisma-owned tables:
--   referential integrity for those ids is enforced at the application layer.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── hs_circulation_posts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hs_circulation_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,

  title           text NOT NULL,
  -- Post body. Stored as the HTML the composer produced; the client sanitises
  -- on render. `body_text` is the plain-text projection used for search so the
  -- LIKE never matches a tag name.
  body            text NOT NULL DEFAULT '',
  body_text       text NOT NULL DEFAULT '',

  category        text NOT NULL DEFAULT 'general'
                    CHECK (category IN
                      ('general', 'announcement', 'policy', 'event', 'celebration', 'alert')),

  -- Pinned posts sort to the top of the feed regardless of recency.
  is_pinned       boolean NOT NULL DEFAULT false,

  author_user_id  text NOT NULL,   -- users.id
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Soft delete: the feed filters these out, so an accidental removal is
  -- recoverable and attachment URLs stay resolvable for anyone mid-read.
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS ix_hs_circulation_posts_feed
  ON hs_circulation_posts (tenant_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_hs_circulation_posts_category
  ON hs_circulation_posts (tenant_id, category)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_hs_circulation_posts_author
  ON hs_circulation_posts (tenant_id, author_user_id)
  WHERE deleted_at IS NULL;

-- ─── hs_circulation_attachments ─────────────────────────────────────────────
-- One row per uploaded file. `kind` splits the gallery (images) from the
-- download list (documents) on render; it is derived from the MIME type at
-- upload time rather than guessed in the UI.
CREATE TABLE IF NOT EXISTS hs_circulation_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  post_id      uuid NOT NULL REFERENCES hs_circulation_posts (id) ON DELETE CASCADE,

  kind         text NOT NULL CHECK (kind IN ('image', 'document')),
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  file_type    text,                                  -- MIME type
  file_size    bigint CHECK (file_size IS NULL OR file_size >= 0),
  sort_order   integer NOT NULL DEFAULT 0,

  uploaded_by  text NOT NULL,   -- users.id
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_hs_circulation_attachments_post
  ON hs_circulation_attachments (tenant_id, post_id, sort_order);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- FORCE makes the policy bind the table owner too (Prisma's role owns these),
-- so there is no implicit bypass.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hs_circulation_posts',
    'hs_circulation_attachments'
  ]
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
