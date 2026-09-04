-- QA Playbooks — the "what should I test?" knowledge layer that feeds QA Space.
--
-- Shape of the module, in the order the tables below appear:
--
--   Playbook ─┬─> Section (nestable) ──> Item   (the recommendation itself)
--             │
--             ├─> Version                       (change history, §19)
--             │
--             └─> Generation                    (playbook → real test cases)
--
-- TENANCY, and the one thing that is different from every other QA table:
--   `tenant_id IS NULL` means a GLOBAL playbook — content Testiez maintains in
--   the repo and syncs at boot. Every tenant reads those; only the sync writes
--   them. A tenant's own playbook (phase 2) carries its tenant_id and is
--   visible to that tenant alone. Reads therefore filter
--   `(tenant_id = $1 OR tenant_id IS NULL)`; writes always pin tenant_id.
--
-- Types match the tables this module joins to, which are NOT uniform across
-- this database:
--   tenant_id / module_id / parent_test_case_id  UUID  — qa_* tables
--   project_id                                   TEXT  — projects (Prisma-era)
-- Getting this wrong produces joins that will not cast, so do not "tidy" it.

-- ─── Playbooks: one per product feature (Login, Logout, …) ──────────────────
CREATE TABLE IF NOT EXISTS qa_playbooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,                              -- NULL = global content
  slug            TEXT NOT NULL,                     -- 'login', 'forgot-password'
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,                     -- 'Authentication', 'Data Management', …
  summary         TEXT,
  overview        TEXT,                              -- markdown, rendered above the sections
  version         TEXT NOT NULL DEFAULT '1.0',
  source          TEXT NOT NULL DEFAULT 'global',    -- global | project
  -- Hash of the source JSON. The boot-time sync short-circuits on an unchanged
  -- hash, so an unchanged deploy costs one SELECT instead of a full rewrite.
  content_hash    TEXT,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Slugs are unique per owner. Two partial indexes rather than one expression
-- index, because NULL tenant_id would otherwise never collide with itself.
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbooks_global_slug_uidx
  ON qa_playbooks (slug) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbooks_tenant_slug_uidx
  ON qa_playbooks (tenant_id, slug) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qa_playbooks_category_idx ON qa_playbooks (category);

-- ─── Sections: the §15 structure tree ───────────────────────────────────────
-- `parent_section_id` is what makes "Basic Testing → Input Validation" possible
-- without a second table. Two levels is all the UI renders today; the column
-- does not stop a third.
CREATE TABLE IF NOT EXISTS qa_playbook_sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id       UUID NOT NULL REFERENCES qa_playbooks(id) ON DELETE CASCADE,
  parent_section_id UUID REFERENCES qa_playbook_sections(id) ON DELETE CASCADE,
  key               TEXT NOT NULL,                   -- stable within a playbook
  title             TEXT NOT NULL,
  description       TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qa_playbook_sections_playbook_idx
  ON qa_playbook_sections (playbook_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_sections_key_uidx
  ON qa_playbook_sections (playbook_id, key);

-- ─── Items: one testing recommendation, in the §16 format ───────────────────
-- Every field below exists because the spec asks the UI to show it. `steps` is
-- the ordered walkthrough for scenario-style items ("Valid User Login"); most
-- items leave it empty and lean on what_to_test + expected.
CREATE TABLE IF NOT EXISTS qa_playbook_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id    UUID NOT NULL REFERENCES qa_playbooks(id) ON DELETE CASCADE,
  section_id     UUID NOT NULL REFERENCES qa_playbook_sections(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,
  title          TEXT NOT NULL,
  what_to_test   TEXT,
  examples       JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{input, verdict}] or [string]
  expected       TEXT,
  steps          JSONB NOT NULL DEFAULT '[]'::jsonb, -- ordered strings
  level          TEXT NOT NULL,                      -- junior | intermediate | senior | expert
  category       TEXT NOT NULL,                      -- ui | input_validation | functional | …
  risk           TEXT NOT NULL DEFAULT 'medium',     -- low | medium | high | critical
  why_it_matters TEXT,
  -- Conditional applicability (§9: "do not force irrelevant OAuth scenarios").
  -- e.g. {"auth": ["oauth"]} — the reader can hide what the product does not use.
  applies_when   JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qa_playbook_items_playbook_idx
  ON qa_playbook_items (playbook_id, sort_order);
CREATE INDEX IF NOT EXISTS qa_playbook_items_section_idx
  ON qa_playbook_items (section_id, sort_order);
CREATE INDEX IF NOT EXISTS qa_playbook_items_level_idx ON qa_playbook_items (playbook_id, level);
CREATE INDEX IF NOT EXISTS qa_playbook_items_category_idx ON qa_playbook_items (playbook_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_items_key_uidx
  ON qa_playbook_items (playbook_id, key);

-- ─── Versions: §19 change history ───────────────────────────────────────────
-- Written by the content sync whenever a playbook's hash changes, so "Login
-- Playbook v3.2 — updated with session security scenarios" is answerable
-- without an authoring UI.
CREATE TABLE IF NOT EXISTS qa_playbook_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id  UUID NOT NULL REFERENCES qa_playbooks(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  changelog    TEXT,
  item_count   INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by UUID
);

CREATE INDEX IF NOT EXISTS qa_playbook_versions_playbook_idx
  ON qa_playbook_versions (playbook_id, published_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_versions_uidx
  ON qa_playbook_versions (playbook_id, version);

-- ─── Generations: the link from playbook to the cases it produced ───────────
-- Phase 1 uses this as an audit trail. Phase 2's coverage math (§20) reads it
-- to answer "which recommendations does this project already cover?", which is
-- why item_keys is stored rather than only a count.
CREATE TABLE IF NOT EXISTS qa_playbook_generations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  playbook_id         UUID NOT NULL REFERENCES qa_playbooks(id) ON DELETE CASCADE,
  project_id          TEXT,
  module_id           UUID,
  parent_test_case_id UUID NOT NULL,
  item_keys           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_count       INTEGER NOT NULL DEFAULT 0,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qa_playbook_generations_tenant_idx
  ON qa_playbook_generations (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qa_playbook_generations_project_idx
  ON qa_playbook_generations (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS qa_playbook_generations_parent_idx
  ON qa_playbook_generations (parent_test_case_id);
