-- Project Agreements — Document Types (migration 011)
--
-- Templates carried a free-text `category` ('MSA', 'SOW', 'NDA'). Open
-- vocabularies drift: 'NDA', 'nda' and 'Non-Disclosure' are three categories
-- and one kind of document, and nothing downstream can group or number by it.
-- This replaces it with a tenant-managed registry, mandatory on both templates
-- and agreements.
--
-- `category` is NOT dropped. The column keeps the original text as provenance
-- and the UI stops surfacing it; the seed below turns every distinct category
-- into a Document Type and links the templates that used it, so nothing lands
-- in the new world untyped.
--
-- document_type_id is NULLABLE in storage and REQUIRED by the API. Existing
-- rows the seed could not classify (a template that never had a category) stay
-- readable and must be given a type the next time they are saved — which is
-- what "mandatory" can mean without rewriting history.

CREATE TABLE IF NOT EXISTS pa_document_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,

  name        text NOT NULL,
  -- The stable machine name — 'TEST_PROPOSAL'. Renaming the type must not
  -- break anything keyed on it, which is the whole reason it is separate.
  code        text NOT NULL,
  description text,

  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),

  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Soft delete, for the reason templates have one: a type named by a signed
  -- agreement has to stay resolvable after it leaves the picker.
  deleted_at  timestamptz
);

-- One code per tenant. Partial, so a soft-deleted type frees its code again.
CREATE UNIQUE INDEX IF NOT EXISTS pa_document_types_code_key
  ON pa_document_types (tenant_id, code) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS pa_document_types_tenant_idx
  ON pa_document_types (tenant_id, status) WHERE deleted_at IS NULL;

ALTER TABLE pa_agreement_templates
  ADD COLUMN IF NOT EXISTS document_type_id uuid;

-- The agreement SNAPSHOTS name and code, the rule every other reference in
-- this module follows: renaming a type must not relabel a signed document.
ALTER TABLE pa_agreements
  ADD COLUMN IF NOT EXISTS document_type_id   uuid,
  ADD COLUMN IF NOT EXISTS document_type_name text,
  ADD COLUMN IF NOT EXISTS document_type_code text;

CREATE INDEX IF NOT EXISTS pa_agreements_doctype_idx
  ON pa_agreements (tenant_id, document_type_id) WHERE deleted_at IS NULL;

-- ── Seed from the categories already in use ────────────────────────────────
-- Code is the category upper-snake-cased. Two categories that normalise to the
-- same code ('Change Order' and 'change-order') collapse into one type, which
-- is the cleanup this table exists to perform.
INSERT INTO pa_document_types (tenant_id, name, code, description)
SELECT DISTINCT ON (t.tenant_id, upper(regexp_replace(btrim(t.category), '[^a-zA-Z0-9]+', '_', 'g')))
       t.tenant_id,
       btrim(t.category),
       upper(regexp_replace(btrim(t.category), '[^a-zA-Z0-9]+', '_', 'g')),
       'Migrated from the template category'
  FROM pa_agreement_templates t
 WHERE t.deleted_at IS NULL
   AND t.category IS NOT NULL
   AND btrim(t.category) <> ''
 ORDER BY t.tenant_id,
          upper(regexp_replace(btrim(t.category), '[^a-zA-Z0-9]+', '_', 'g')),
          t.created_at
ON CONFLICT DO NOTHING;

UPDATE pa_agreement_templates t
   SET document_type_id = dt.id
  FROM pa_document_types dt
 WHERE dt.tenant_id = t.tenant_id
   AND dt.code = upper(regexp_replace(btrim(t.category), '[^a-zA-Z0-9]+', '_', 'g'))
   AND t.document_type_id IS NULL
   AND t.category IS NOT NULL
   AND btrim(t.category) <> '';

-- Agreements inherit the type of the template they were cut from, and snapshot
-- it, so an existing document shows the same kind its template declares.
UPDATE pa_agreements a
   SET document_type_id   = dt.id,
       document_type_name = dt.name,
       document_type_code = dt.code
  FROM pa_agreement_templates t
  JOIN pa_document_types dt ON dt.id = t.document_type_id
 WHERE a.template_id = t.id
   AND a.document_type_id IS NULL;
