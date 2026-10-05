-- ============================================================================
-- Project Agreements — initial schema (migration 001)
--
-- The module that turns a reusable AGREEMENT TEMPLATE into a real DOCUMENT
-- bound to one project (an MSA, an SOW, an NDA, a change order …).
--
-- Shape, in the order the tables appear:
--
--   Branding ───────────────────────────────> the letterhead every doc wears
--   Template ─┬─> Placeholder                 what the composer asks for
--             │
--             └─> Agreement ──> Value         the filled-in document + answers
--
-- WHY A SNAPSHOT, and the one decision worth defending: `pa_agreements` stores
-- `content_html` — the template BODY already rendered with this project's
-- values — rather than re-rendering from the template on every read. An
-- agreement is a legal artefact: what the parties signed must not change
-- because somebody edited the template afterwards. `template_version` records
-- which revision it came from, so provenance survives too.
--
-- Header/footer chrome is deliberately NOT baked into content_html. It is
-- assembled at render time from pa_branding, so a company that changes its
-- phone number does not have to regenerate signed documents to get a correct
-- letterhead on a fresh PDF — while the agreed TEXT stays frozen.
--
-- TENANT ISOLATION = two independent layers, as everywhere else in this repo:
--   1. RLS policies at the bottom (FORCE'd, so even the table owner is bound).
--   2. Explicit `tenant_id = $1` filters in every repository query.
--   withTenant() sets app.current_tenant_id transaction-LOCAL per operation.
--
-- ID TYPE NOTE — do not "tidy" these:
--   tenant_id / created_by / updated_by   uuid  (Prisma generates uuid)
--   project_id                            text  (projects.id is text/uuid-as-
--                                                text in the Prisma era, and
--                                                other raw-SQL modules already
--                                                store it as text)
--   No foreign keys point at Prisma-owned tables; that integrity is enforced in
--   the application layer so this module stays decoupled from schema.prisma.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─── pa_branding ────────────────────────────────────────────────────────────
-- Exactly ONE row per tenant: the letterhead. Header carries the logo, company
-- name and tagline on the right; the document's own name sits on the left at
-- render time. Footer carries phone, email and website.
--
-- Seeded lazily from general_settings / cd_company_details the first time the
-- branding endpoint is read — see branding.repo.ts. Kept as its OWN row rather
-- than read through to those tables every time, because a contract letterhead
-- is a deliberate choice (a trading name, a support line) that should not shift
-- when somebody edits invoice settings.
CREATE TABLE IF NOT EXISTS pa_branding (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL UNIQUE,

  company_name   text,
  tagline        text,
  logo_url       text,

  phone          text,
  email          text,
  website        text,

  -- Free-form line under the footer contacts (registered address, CIN, GST…).
  footer_note    text,

  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── pa_agreement_templates ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pa_agreement_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,

  name           text NOT NULL,
  -- Open vocabulary ('MSA', 'SOW', 'NDA', 'Change Order'). A closed set sends
  -- people back to encoding the kind in the name.
  category       text,
  description    text,

  -- The editable body. Header and footer are NOT in here; see the note above.
  body_html      text NOT NULL DEFAULT '',

  status         text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'published', 'archived')),
  -- Bumped on every body edit, so an agreement can name the revision it froze.
  version        integer NOT NULL DEFAULT 1,

  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Soft delete: a template referenced by signed agreements must stay
  -- resolvable for provenance even after it leaves the picker.
  deleted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS pa_templates_tenant_idx
  ON pa_agreement_templates (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pa_templates_status_idx
  ON pa_agreement_templates (tenant_id, status) WHERE deleted_at IS NULL;
-- One name per tenant among live templates. Partial, so a deleted template
-- never blocks reusing its name.
CREATE UNIQUE INDEX IF NOT EXISTS pa_templates_tenant_name_uidx
  ON pa_agreement_templates (tenant_id, lower(name)) WHERE deleted_at IS NULL;

-- ─── pa_template_placeholders ───────────────────────────────────────────────
-- What the composer asks the user for. `key` is what appears in body_html as
-- {{key}}; `source` says whether the composer should prefill it from the
-- selected project instead of asking.
CREATE TABLE IF NOT EXISTS pa_template_placeholders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  template_id    uuid NOT NULL REFERENCES pa_agreement_templates(id) ON DELETE CASCADE,

  key            text NOT NULL,
  label          text NOT NULL,
  data_type      text NOT NULL DEFAULT 'text'
                 CHECK (data_type IN ('text', 'textarea', 'number', 'date', 'currency')),
  -- 'manual'  — typed in the composer
  -- 'project' — resolved from the selected project (name, code, dates, manager)
  -- 'company' — resolved from pa_branding
  source         text NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual', 'project', 'company')),
  required       boolean NOT NULL DEFAULT false,
  default_value  text,
  display_order  integer NOT NULL DEFAULT 0,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pa_placeholders_template_key_uidx
  ON pa_template_placeholders (template_id, key);
CREATE INDEX IF NOT EXISTS pa_placeholders_template_idx
  ON pa_template_placeholders (template_id, display_order);

-- ─── pa_agreements ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pa_agreements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,

  -- projects.id is TEXT in this database. See the ID TYPE NOTE at the top.
  project_id        text NOT NULL,
  -- Denormalised at creation so the list renders without joining Prisma-owned
  -- tables, and so a renamed project does not rewrite history on signed docs.
  project_name      text,
  project_code      text,

  -- Kept after a template is deleted (ON DELETE SET NULL) — the snapshot in
  -- content_html is the document; the link is provenance.
  template_id       uuid REFERENCES pa_agreement_templates(id) ON DELETE SET NULL,
  template_name     text,
  template_version  integer,

  -- Shown top-left in the document header.
  title             text NOT NULL,
  -- Human reference ('AGR-2026-0007'). Unique per tenant when present.
  document_number   text,

  -- The frozen, placeholder-substituted body. THE document.
  content_html      text NOT NULL DEFAULT '',

  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'pending', 'active', 'expired', 'terminated')),
  effective_date    date,
  expiry_date       date,

  -- Counterparty on the other side of the agreement (client contact).
  party_name        text,
  party_email       text,

  notes             text,
  -- Last generated PDF in R2. Regenerating replaces it.
  pdf_url           text,
  pdf_generated_at  timestamptz,

  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS pa_agreements_tenant_idx
  ON pa_agreements (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pa_agreements_project_idx
  ON pa_agreements (tenant_id, project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS pa_agreements_status_idx
  ON pa_agreements (tenant_id, status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pa_agreements_tenant_number_uidx
  ON pa_agreements (tenant_id, lower(document_number))
  WHERE deleted_at IS NULL AND document_number IS NOT NULL;

-- ─── pa_agreement_values ────────────────────────────────────────────────────
-- What was answered, so reopening the composer shows the same form filled in.
-- The rendered result already lives in pa_agreements.content_html; these rows
-- exist to EDIT it, not to re-derive it.
CREATE TABLE IF NOT EXISTS pa_agreement_values (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  agreement_id   uuid NOT NULL REFERENCES pa_agreements(id) ON DELETE CASCADE,

  key            text NOT NULL,
  value          text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pa_values_agreement_key_uidx
  ON pa_agreement_values (agreement_id, key);

-- ─── Row Level Security ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pa_branding',
    'pa_agreement_templates',
    'pa_template_placeholders',
    'pa_agreements',
    'pa_agreement_values'
  ] LOOP
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
