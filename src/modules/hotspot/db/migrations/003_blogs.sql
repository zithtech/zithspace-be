-- ============================================================================
-- Hotspot — Blogs (migration 003)
--
-- The social feed: an employee posts text and images, tags colleagues, and
-- everyone reacts and comments. Circulation is the noticeboard (one-to-many,
-- authored, formal); Blogs is the conversation.
--
-- Pure raw SQL. These tables are NOT in schema.prisma and are managed
-- exclusively by the hotspot migration runner. All tables are prefixed `hs_`.
--
-- WHY THE BODY IS PLAIN TEXT, NOT HTML:
--   Circulation bodies are rich text because a policy notice needs headings and
--   lists. A blog post is a status update — text, line breaks, @mentions. Plain
--   text removes the whole stored-XSS surface (nothing to sanitise, nothing to
--   trust) and makes `body ILIKE` a real search rather than one that matches tag
--   names. Mentions live in hs_blog_mentions, which is the authoritative list;
--   the body only carries the "@Display Name" the author typed.
--
-- ID TYPE NOTE:
--   `tenant_id` and our own ids are uuid. Ids pointing at Prisma-owned tables
--   (users.id) are `text` — Prisma stores String ids as text, and text lets us
--   LEFT JOIN those tables without a cast. No foreign keys point at
--   Prisma-owned tables; that integrity is enforced at the application layer.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── hs_blog_posts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hs_blog_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,

  -- Plain text, including newlines and the literal "@Name" the author typed.
  body            text NOT NULL DEFAULT '',

  author_user_id  text NOT NULL,   -- users.id
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Soft delete: the feed filters these out, so an accidental removal is
  -- recoverable and image URLs stay resolvable for anyone mid-read.
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS ix_hs_blog_posts_feed
  ON hs_blog_posts (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_hs_blog_posts_author
  ON hs_blog_posts (tenant_id, author_user_id)
  WHERE deleted_at IS NULL;

-- ─── hs_blog_images ─────────────────────────────────────────────────────────
-- Images only. A blog post is a photo-and-caption format; documents belong on a
-- circulation notice, and allowing them here would blur the two surfaces.
CREATE TABLE IF NOT EXISTS hs_blog_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  post_id      uuid NOT NULL REFERENCES hs_blog_posts (id) ON DELETE CASCADE,

  file_name    text NOT NULL,
  file_url     text NOT NULL,
  file_type    text,                                  -- MIME type
  file_size    bigint CHECK (file_size IS NULL OR file_size >= 0),
  sort_order   integer NOT NULL DEFAULT 0,

  uploaded_by  text NOT NULL,   -- users.id
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_hs_blog_images_post
  ON hs_blog_images (tenant_id, post_id, sort_order);

-- ─── hs_blog_comments ───────────────────────────────────────────────────────
-- One level of replies: `parent_comment_id` may point at a top-level comment,
-- never at another reply. Deeper nesting is enforced in the service — a tree of
-- arbitrary depth is unreadable in a feed and a pain to paginate.
CREATE TABLE IF NOT EXISTS hs_blog_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  post_id           uuid NOT NULL REFERENCES hs_blog_posts (id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES hs_blog_comments (id) ON DELETE CASCADE,

  body              text NOT NULL,
  author_user_id    text NOT NULL,   -- users.id
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS ix_hs_blog_comments_post
  ON hs_blog_comments (tenant_id, post_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_hs_blog_comments_parent
  ON hs_blog_comments (tenant_id, parent_comment_id, created_at)
  WHERE deleted_at IS NULL;

-- ─── hs_blog_reactions ──────────────────────────────────────────────────────
-- One row per (user, target). A user has AT MOST ONE reaction on a given post
-- or comment — picking a new one replaces the old, the way LinkedIn behaves.
-- That is what the partial unique indexes below enforce.
--
-- The nullable-pair + CHECK shape (rather than a `target_type`/`target_id`
-- discriminator) is deliberate: it keeps real foreign keys, so deleting a post
-- or a comment takes its reactions with it instead of leaving orphans.
CREATE TABLE IF NOT EXISTS hs_blog_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  post_id     uuid REFERENCES hs_blog_posts (id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES hs_blog_comments (id) ON DELETE CASCADE,

  user_id     text NOT NULL,   -- users.id
  reaction    text NOT NULL
                CHECK (reaction IN ('like', 'celebrate', 'support', 'love', 'insightful', 'funny')),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Exactly one target, never both and never neither.
  CONSTRAINT hs_blog_reactions_one_target
    CHECK ((post_id IS NOT NULL) <> (comment_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hs_blog_reactions_post_user
  ON hs_blog_reactions (tenant_id, post_id, user_id)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_hs_blog_reactions_comment_user
  ON hs_blog_reactions (tenant_id, comment_id, user_id)
  WHERE comment_id IS NOT NULL;

-- ─── hs_blog_mentions ───────────────────────────────────────────────────────
-- The authoritative list of who was tagged. The body text is only what the
-- author typed; this is what a notification would read from, and what the
-- client uses to turn "@Priya Sharma" into a link.
CREATE TABLE IF NOT EXISTS hs_blog_mentions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  post_id     uuid REFERENCES hs_blog_posts (id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES hs_blog_comments (id) ON DELETE CASCADE,

  user_id     text NOT NULL,   -- users.id
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hs_blog_mentions_one_target
    CHECK ((post_id IS NOT NULL) <> (comment_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hs_blog_mentions_post_user
  ON hs_blog_mentions (tenant_id, post_id, user_id)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_hs_blog_mentions_comment_user
  ON hs_blog_mentions (tenant_id, comment_id, user_id)
  WHERE comment_id IS NOT NULL;

-- "Posts that mention me" — the one filter worth an index of its own.
CREATE INDEX IF NOT EXISTS ix_hs_blog_mentions_user
  ON hs_blog_mentions (tenant_id, user_id);

-- ─── Row-Level Security ─────────────────────────────────────────────────────
-- FORCE makes the policy bind the table owner too (Prisma's role owns these),
-- so there is no implicit bypass.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hs_blog_posts',
    'hs_blog_images',
    'hs_blog_comments',
    'hs_blog_reactions',
    'hs_blog_mentions'
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
