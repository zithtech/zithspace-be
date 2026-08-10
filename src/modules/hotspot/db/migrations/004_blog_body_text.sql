-- ============================================================================
-- Hotspot — Blogs: rich-text bodies (migration 004)
--
-- Migration 003 stored `body` as plain text, on the reasoning that a status
-- update needs no formatting. Authors asked for a real editor, so `body` now
-- holds sanitised HTML from the composer — and that breaks two things which
-- this column fixes:
--
--   1. SEARCH. `body ILIKE '%table%'` against HTML matches the <table> tag, not
--      the word. Search moves to `body_text`.
--   2. MENTIONS. The service records a mention only when "@Name" actually
--      appears in what people read. Checking that against raw HTML would
--      mismatch the moment a name straddles a tag boundary.
--
-- `body_text` is derived server-side from the SANITISED html on every write, so
-- it can never claim text the post does not contain.
--
-- Existing rows already hold plain text, so the backfill is a straight copy —
-- no HTML parsing needed, and it is correct for every row written before now.
-- ============================================================================

ALTER TABLE hs_blog_posts
  ADD COLUMN IF NOT EXISTS body_text text NOT NULL DEFAULT '';

UPDATE hs_blog_posts
   SET body_text = body
 WHERE body_text = '' AND body <> '';
