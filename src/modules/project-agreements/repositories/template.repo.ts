// src/modules/project-agreements/repositories/template.repo.ts
//
// Agreement templates and their placeholders.
//
// PLACEHOLDERS ARE REPLACED WHOLESALE on save, not diffed. The editor hands
// back the complete list every time, and a partial update would leave orphan
// rows for fields the author deleted — which the composer would then keep
// asking for. Deleting and re-inserting inside the same transaction (withTenant
// wraps it) is both simpler and correct.
//
// SOFT DELETE, because an agreement keeps a provenance link to the template it
// came from. `ON DELETE SET NULL` protects the document either way, but keeping
// the row means a signed contract can still say which revision it froze.

import { TenantClient } from '../db/pool';
import { AgreementTemplate, TemplatePlaceholder, TemplateStatus } from '../types';

interface TemplateInput {
  name: string;
  documentTypeId: string;
  category?: string | null;
  description?: string | null;
  bodyHtml: string;
  status: TemplateStatus;
  placeholders: Array<Omit<TemplatePlaceholder, 'id' | 'templateId'>>;
}

const TEMPLATE_COLUMNS = `
  t.id,
  t.name,
  t.document_type_id AS "documentTypeId",
  -- Resolved, not snapshot: a template SHOULD follow a renamed type. Only the
  -- signed agreement freezes the name it was raised under.
  dt.name AS "documentTypeName",
  dt.code AS "documentTypeCode",
  t.category,
  t.description,
  t.body_html   AS "bodyHtml",
  t.status,
  t.version,
  t.created_by  AS "createdBy",
  t.updated_by  AS "updatedBy",
  t.created_at  AS "createdAt",
  t.updated_at  AS "updatedAt"
`;

const PLACEHOLDERS_JSON = `
  COALESCE((
    SELECT json_agg(json_build_object(
             'id', p.id,
             'templateId', p.template_id,
             'key', p.key,
             'label', p.label,
             'dataType', p.data_type,
             'source', p.source,
             'required', p.required,
             'defaultValue', p.default_value,
             'displayOrder', p.display_order
           ) ORDER BY p.display_order, p.label)
      FROM pa_template_placeholders p
     WHERE p.template_id = t.id
  ), '[]'::json) AS placeholders
`;

export interface TemplateFilters {
  status?: TemplateStatus;
  search?: string;
  /** Templates a composer may actually use. */
  publishedOnly?: boolean;
}

export async function listTemplates(
  client: TenantClient,
  filters: TemplateFilters = {}
): Promise<AgreementTemplate[]> {
  const params: any[] = [client.tenantId];
  const where = ['t.tenant_id = $1', 't.deleted_at IS NULL'];

  if (filters.publishedOnly) {
    where.push(`t.status = 'published'`);
  } else if (filters.status) {
    params.push(filters.status);
    where.push(`t.status = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(
      `(lower(t.name) LIKE $${params.length} OR lower(COALESCE(t.category, '')) LIKE $${params.length})`
    );
  }

  const { rows } = await client.query<AgreementTemplate>(
    `SELECT ${TEMPLATE_COLUMNS},
            ${PLACEHOLDERS_JSON},
            (SELECT count(*)::int
               FROM pa_agreements a
              WHERE a.template_id = t.id AND a.deleted_at IS NULL) AS "agreementCount"
       FROM pa_agreement_templates t
       LEFT JOIN pa_document_types dt ON dt.id = t.document_type_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.updated_at DESC`,
    params
  );
  return rows;
}

export async function getTemplate(
  client: TenantClient,
  id: string
): Promise<AgreementTemplate | null> {
  const { rows } = await client.query<AgreementTemplate>(
    `SELECT ${TEMPLATE_COLUMNS},
            ${PLACEHOLDERS_JSON},
            (SELECT count(*)::int
               FROM pa_agreements a
              WHERE a.template_id = t.id AND a.deleted_at IS NULL) AS "agreementCount"
       FROM pa_agreement_templates t
       LEFT JOIN pa_document_types dt ON dt.id = t.document_type_id
      WHERE t.tenant_id = $1 AND t.id = $2 AND t.deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ?? null;
}

export async function createTemplate(
  client: TenantClient,
  input: TemplateInput,
  userId: string | null
): Promise<AgreementTemplate> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO pa_agreement_templates
       (tenant_id, name, document_type_id, category, description, body_html, status,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     RETURNING id`,
    [
      client.tenantId,
      input.name,
      input.documentTypeId,
      input.category ?? null,
      input.description ?? null,
      input.bodyHtml,
      input.status,
      userId,
    ]
  );
  const id = rows[0].id;
  await replacePlaceholders(client, id, input.placeholders);
  return (await getTemplate(client, id))!;
}

export async function updateTemplate(
  client: TenantClient,
  id: string,
  input: TemplateInput,
  userId: string | null
): Promise<AgreementTemplate | null> {
  // The version only moves when the wording does. Renaming a template or
  // flipping it to published is not a new revision of the contract text, and
  // bumping on every save would make the number meaningless on the documents
  // that cite it.
  const { rowCount } = await client.query(
    `UPDATE pa_agreement_templates
        SET name        = $3,
            document_type_id = $9,
            category    = $4,
            description = $5,
            body_html   = $6,
            status      = $7,
            version     = CASE WHEN body_html IS DISTINCT FROM $6 THEN version + 1 ELSE version END,
            updated_by  = $8,
            updated_at  = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [
      client.tenantId,
      id,
      input.name,
      input.category ?? null,
      input.description ?? null,
      input.bodyHtml,
      input.status,
      userId,
      input.documentTypeId,
    ]
  );
  if (!rowCount) return null;

  await replacePlaceholders(client, id, input.placeholders);
  return getTemplate(client, id);
}

export async function setTemplateStatus(
  client: TenantClient,
  id: string,
  status: TemplateStatus,
  userId: string | null
): Promise<AgreementTemplate | null> {
  const { rowCount } = await client.query(
    `UPDATE pa_agreement_templates
        SET status = $3, updated_by = $4, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, status, userId]
  );
  return rowCount ? getTemplate(client, id) : null;
}

export async function deleteTemplate(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pa_agreement_templates
        SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return Boolean(rowCount);
}

/** Duplicate a template, wording and fields, as a fresh draft. */
export async function duplicateTemplate(
  client: TenantClient,
  id: string,
  userId: string | null
): Promise<AgreementTemplate | null> {
  const source = await getTemplate(client, id);
  if (!source) return null;

  return createTemplate(
    client,
    {
      name: await uniqueCopyName(client, source.name),
      documentTypeId: source.documentTypeId!,
      category: source.category,
      description: source.description,
      bodyHtml: source.bodyHtml,
      status: 'draft',
      placeholders: source.placeholders.map(({ id: _id, templateId: _t, ...rest }) => rest),
    },
    userId
  );
}

async function uniqueCopyName(client: TenantClient, name: string): Promise<string> {
  const base = `${name} (Copy)`.slice(0, 160);
  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? base : `${name} (Copy ${n + 1})`.slice(0, 160);
    const { rows } = await client.query(
      `SELECT 1 FROM pa_agreement_templates
        WHERE tenant_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
        LIMIT 1`,
      [client.tenantId, candidate]
    );
    if (rows.length === 0) return candidate;
  }
  // 50 copies of one template is not a naming problem worth solving; let the
  // unique index refuse it and the 23505 handler explain why.
  return base;
}

async function replacePlaceholders(
  client: TenantClient,
  templateId: string,
  placeholders: Array<Omit<TemplatePlaceholder, 'id' | 'templateId'>>
): Promise<void> {
  await client.query(`DELETE FROM pa_template_placeholders WHERE template_id = $1`, [templateId]);
  if (placeholders.length === 0) return;

  const values: any[] = [];
  const tuples = placeholders.map((p, i) => {
    const o = i * 8;
    values.push(
      client.tenantId,
      templateId,
      p.key,
      p.label,
      p.dataType,
      p.source,
      p.required,
      p.defaultValue ?? null
    );
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, ${i})`;
  });

  await client.query(
    `INSERT INTO pa_template_placeholders
       (tenant_id, template_id, key, label, data_type, source, required, default_value, display_order)
     VALUES ${tuples.join(', ')}`,
    values
  );
}
