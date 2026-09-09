-- QA Playbooks — Collections: the "which of these apply to ME?" layer.
--
-- THE PROBLEM THIS SOLVES:
--   `qa_playbooks.category` says what part of an app a playbook is about
--   ("Authentication", "Data Management"). It answers a QA who already knows
--   which area they are working on. It cannot answer the question a NEW
--   customer actually asks — "we build a lending app, which of your 300
--   playbooks are mine?" — because that is a different axis entirely.
--
--   A Collection is that axis: a curated, ORDERED bundle of playbooks assembled
--   for an audience. "Fintech & Payments", "PCI-DSS", "Launch readiness".
--
-- MANY-TO-MANY, AND WHY IT COULD NOT BE A COLUMN:
--   'Login' belongs to fintech AND e-commerce AND school management. A column
--   on qa_playbooks would force one home per playbook and the library would
--   drift into per-vertical duplicates of the same content. Membership is
--   therefore its own table, and a playbook may sit in any number of
--   collections — in a different position in each.
--
-- KIND IS NOT THE INDUSTRY LIST:
--   Fintech / e-commerce / school management are all values of ONE kind,
--   'industry'. `kind` is the small closed set of ways to bundle; the industry
--   is the collection's NAME. That is what lets a compliance pack (PCI-DSS), a
--   release-stage pack (Launch readiness) and an editorial pack (Start here)
--   live in this table without inventing a fake industry for each.
--
-- OWNERSHIP AND TIERS mirror qa_playbooks exactly — same columns, same CHECK,
-- same two partial slug indexes — so the access code is one shape rather than
-- two that drift. v1 curates library collections only (tenant_id NULL); the
-- 'workspace' tier is carried now so a tenant's own pack is a row, not a
-- migration, when phase 2 lands.
--
-- PRICING (phase 3, columns carried now so the decision is not re-litigated):
--   A collection is the natural SKU — "Fintech pack, 40 playbooks" sells where
--   40 individual unlocks do not. The DECIDED semantics are DYNAMIC: a tenant
--   who unlocks a collection can read whatever that collection contains AT READ
--   TIME, so a playbook added to the pack next month is included. That is why
--   there is no purchase-time snapshot table here — access resolves through
--   qa_playbook_collection_items live, and the pack growing is the selling
--   point rather than an accounting problem.

-- ─── Collections ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_playbook_collections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID,                                -- NULL = Testiez-owned
  slug           TEXT NOT NULL,                       -- 'fintech-payments'
  name           TEXT NOT NULL,
  -- industry | compliance | platform | stage | curated. See constants.ts.
  kind           TEXT NOT NULL DEFAULT 'industry',
  summary        TEXT,                                -- one line, on the card
  description    TEXT,                                -- markdown, on the detail page
  -- A lucide icon name. Rendered by the FE against its own allow-list, so an
  -- unknown value degrades to the default rather than breaking the page.
  icon           TEXT,
  visibility     TEXT NOT NULL DEFAULT 'workspace',
  status         TEXT NOT NULL DEFAULT 'draft',       -- draft | published | archived
  price_credits  INTEGER,
  price_amount   NUMERIC(12,2),
  price_currency TEXT NOT NULL DEFAULT 'USD',
  -- Curated ordering of the collections themselves: the shelf has a front.
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_by     UUID,
  updated_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE qa_playbook_collections DROP CONSTRAINT IF EXISTS qa_playbook_collections_kind_chk;
ALTER TABLE qa_playbook_collections ADD CONSTRAINT qa_playbook_collections_kind_chk
  CHECK (kind IN ('industry', 'compliance', 'platform', 'stage', 'curated'));

ALTER TABLE qa_playbook_collections DROP CONSTRAINT IF EXISTS qa_playbook_collections_visibility_chk;
ALTER TABLE qa_playbook_collections ADD CONSTRAINT qa_playbook_collections_visibility_chk
  CHECK (visibility IN ('public', 'premium', 'workspace'));

ALTER TABLE qa_playbook_collections DROP CONSTRAINT IF EXISTS qa_playbook_collections_status_chk;
ALTER TABLE qa_playbook_collections ADD CONSTRAINT qa_playbook_collections_status_chk
  CHECK (status IN ('draft', 'published', 'archived'));

-- The same rule migration 002 puts on playbooks, for the same reason: a tenant
-- must not be able to publish to the whole platform by putting 'public' in a
-- request body, and a library row must never be private to one tenant.
ALTER TABLE qa_playbook_collections DROP CONSTRAINT IF EXISTS qa_playbook_collections_owner_visibility_chk;
ALTER TABLE qa_playbook_collections ADD CONSTRAINT qa_playbook_collections_owner_visibility_chk
  CHECK (
    (tenant_id IS NULL     AND visibility IN ('public', 'premium')) OR
    (tenant_id IS NOT NULL AND visibility = 'workspace')
  );

-- Two partial indexes rather than one expression index, because a NULL
-- tenant_id never collides with itself. Same shape as qa_playbooks.
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_collections_global_slug_uidx
  ON qa_playbook_collections (slug) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_collections_tenant_slug_uidx
  ON qa_playbook_collections (tenant_id, slug) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qa_playbook_collections_kind_idx
  ON qa_playbook_collections (kind, sort_order);
CREATE INDEX IF NOT EXISTS qa_playbook_collections_visibility_idx
  ON qa_playbook_collections (visibility, status);

-- ─── Membership: the mapping, and the order to read it in ───────────────────
-- ORDER IS THE POINT, not a nicety. "Start with Auth, then Payments, then
-- Reconciliation" is most of what a customer who does not know where to begin
-- is buying. A set would have been cheaper and worth much less.
--
-- `note` is why THIS playbook is in THIS pack — the same playbook earns its
-- place in Fintech and in E-commerce for different reasons, so the reason
-- belongs on the membership rather than on the playbook.
CREATE TABLE IF NOT EXISTS qa_playbook_collection_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES qa_playbook_collections(id) ON DELETE CASCADE,
  playbook_id   UUID NOT NULL REFERENCES qa_playbooks(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  note          TEXT,
  added_by      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A playbook is in a collection once. Adding it twice is a curation slip, not
-- two memberships, and it would double the pack's count.
CREATE UNIQUE INDEX IF NOT EXISTS qa_playbook_collection_items_uidx
  ON qa_playbook_collection_items (collection_id, playbook_id);
CREATE INDEX IF NOT EXISTS qa_playbook_collection_items_order_idx
  ON qa_playbook_collection_items (collection_id, sort_order);
-- Drives "which collections is this playbook in?" on the playbook card.
CREATE INDEX IF NOT EXISTS qa_playbook_collection_items_playbook_idx
  ON qa_playbook_collection_items (playbook_id);

-- ─── Seed: the shelves, empty ───────────────────────────────────────────────
-- Shells only — name, kind and ordering — with NO membership and status
-- 'draft', so nothing is visible to a tenant until someone at Testiez has
-- actually curated it. This does not fight the "database is the only source of
-- truth" rule migration 002 established: it is a one-time INSERT, not a
-- recurring sync, and ON CONFLICT DO NOTHING means a later deploy never
-- reaches back over an editor's work.
INSERT INTO qa_playbook_collections (tenant_id, slug, name, kind, summary, icon, visibility, status, sort_order)
VALUES
  (NULL, 'start-here', 'Start Here', 'curated',
   'The first playbooks to read on any product, whatever you build.', 'Compass', 'public', 'draft', 0),
  (NULL, 'fintech-payments', 'Fintech & Payments', 'industry',
   'Money movement, ledgers, KYC and the failure modes that cost real money.', 'Landmark', 'public', 'draft', 10),
  (NULL, 'ecommerce-marketplace', 'E-commerce & Marketplace', 'industry',
   'Catalog, cart, checkout, fulfilment and the returns nobody tests.', 'ShoppingCart', 'public', 'draft', 20),
  (NULL, 'school-college-management', 'School & College Management', 'industry',
   'Admissions, attendance, grading, fees and the academic calendar.', 'GraduationCap', 'public', 'draft', 30),
  (NULL, 'healthcare-patient-data', 'Healthcare & Patient Data', 'industry',
   'Records, appointments, consent and the access rules around them.', 'HeartPulse', 'public', 'draft', 40),
  (NULL, 'hr-payroll', 'HR & Payroll Platforms', 'industry',
   'Onboarding, leave, attendance, payroll runs and the money at the end.', 'Users', 'public', 'draft', 50),
  (NULL, 'saas-multi-tenant', 'SaaS & Multi-tenant Admin', 'industry',
   'Tenancy, roles, subscriptions and the boundaries between customers.', 'Building2', 'public', 'draft', 60),
  (NULL, 'launch-readiness', 'Launch Readiness', 'stage',
   'What to have covered before a first release goes in front of customers.', 'Rocket', 'public', 'draft', 70),
  (NULL, 'pci-dss-payments', 'PCI-DSS Payment Security', 'compliance',
   'The payment-security positions an auditor will ask you to evidence.', 'ShieldCheck', 'public', 'draft', 80)
ON CONFLICT DO NOTHING;
