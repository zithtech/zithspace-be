-- ============================================================================
-- Opening Management — cached AI suggestions per job title (migration 008)
--
-- Purpose: the "Enhance content" picker asks the model for skills and themes
-- related to a job title. The answer for "Software Engineer" is the same today
-- as it was last week, so regenerating it on every click is a waste of latency
-- and tokens. This table is the cache: look here first, call the model only on
-- a miss, and write the result back.
--
-- ⚠ THIS TABLE IS DELIBERATELY NOT TENANT-SCOPED.
--
-- There is no `tenant_id` column and no RLS policy — that is the explicit
-- design, because a role's generic skill list ("React", "System design") is not
-- tenant data and every tenant benefits from the same cache. Two consequences
-- whoever touches this next must know:
--
--   1. Content written by one tenant is READ BY ALL TENANTS. Never store
--      anything tenant-identifying here — no client names, no internal system
--      names, no headcount or budget. The service layer is the only guard.
--   2. Every other om_* table has RLS and a tenant filter. Do NOT copy this
--      table's pattern when adding a normal feature table; copy 001 instead.
--
-- SHAPE: one row per job title. `content` is keyed by field, e.g.
--   {
--     "job_description":  [ { "key": "skills", "label": "…", "items": [...] } ],
--     "responsibilities": [ … ]
--   }
-- so a title generated for one field does not have to be regenerated for the
-- other, and both live under the single `position` row the spec asked for.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS om_position_suggestions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The job title, stored as the user typed it. Matching is case-insensitive
  -- via the unique index below.
  position   text NOT NULL,
  content    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Flip to false to retire a cached entry: the lookup ignores inactive rows,
  -- so the next request regenerates and overwrites it.
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_om_position_suggestions_position CHECK (length(btrim(position)) > 0)
);

-- One row per title, case-insensitively — this is also what makes the upsert
-- in the repository safe under concurrent first-time generation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_om_position_suggestions_position
  ON om_position_suggestions (lower(btrim(position)));

CREATE INDEX IF NOT EXISTS ix_om_position_suggestions_active
  ON om_position_suggestions (lower(btrim(position)))
  WHERE is_active;

-- No RLS by design — see the header. This is the only table in the module
-- without it.
