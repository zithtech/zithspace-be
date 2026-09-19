// src/modules/project-agreements/repositories/documentType.repo.ts
//
// The tenant's registry of document kinds — Proposal, MSA, NDA, Change Order.
//
// Owned by this module, unlike projects and clients. The code is the stable
// machine name and the reason the table exists: renaming a type must not break
// anything keyed on it, so `name` is free to change and `code` is not.

import { TenantClient } from '../db/pool';
import { DocumentType, DocumentTypeStatus } from '../types';

export interface DocumentTypeInput {
  name: string;
  code: string;
  description: string | null;
  status: DocumentTypeStatus;
}

const COLUMNS = `
  d.id,
  d.name,
  d.code,
  d.description,
  d.status,
  d.created_at AS "createdAt",
  d.updated_at AS "updatedAt"
`;

export async function listDocumentTypes(
  client: TenantClient,
  opts: { search?: string; status?: DocumentTypeStatus; activeOnly?: boolean } = {}
): Promise<DocumentType[]> {
  const params: any[] = [client.tenantId];
  const where = ['d.tenant_id = $1', 'd.deleted_at IS NULL'];

  if (opts.activeOnly) {
    where.push(`d.status = 'active'`);
  } else if (opts.status) {
    params.push(opts.status);
    where.push(`d.status = $${params.length}`);
  }

  if (opts.search) {
    params.push(`%${opts.search.toLowerCase()}%`);
    where.push(
      `(lower(d.name) LIKE $${params.length} OR lower(d.code) LIKE $${params.length})`
    );
  }

  const { rows } = await client.query<DocumentType>(
    `SELECT ${COLUMNS},
            (SELECT count(*) FROM pa_agreement_templates t
              WHERE t.document_type_id = d.id AND t.deleted_at IS NULL)::int AS "templateCount",
            (SELECT count(*) FROM pa_agreements a
              WHERE a.document_type_id = d.id AND a.deleted_at IS NULL)::int AS "agreementCount"
       FROM pa_document_types d
      WHERE ${where.join(' AND ')}
      ORDER BY d.name ASC`,
    params
  );
  return rows;
}

export async function getDocumentType(
  client: TenantClient,
  id: string
): Promise<DocumentType | null> {
  const { rows } = await client.query<DocumentType>(
    `SELECT ${COLUMNS}
       FROM pa_document_types d
      WHERE d.tenant_id = $1 AND d.id = $2 AND d.deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ?? null;
}

/** Is this code already taken by a live type other than `exceptId`? */
export async function codeTaken(
  client: TenantClient,
  code: string,
  exceptId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, code];
  let sql = `SELECT 1 FROM pa_document_types
              WHERE tenant_id = $1 AND code = $2 AND deleted_at IS NULL`;
  if (exceptId) {
    params.push(exceptId);
    sql += ` AND id <> $${params.length}`;
  }
  const { rowCount } = await client.query(sql + ' LIMIT 1', params);
  return Boolean(rowCount);
}

export async function createDocumentType(
  client: TenantClient,
  input: DocumentTypeInput,
  userId: string | null
): Promise<DocumentType> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO pa_document_types
       (tenant_id, name, code, description, status, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING id`,
    [client.tenantId, input.name, input.code, input.description, input.status, userId]
  );
  return (await getDocumentType(client, rows[0].id))!;
}

export async function updateDocumentType(
  client: TenantClient,
  id: string,
  input: DocumentTypeInput,
  userId: string | null
): Promise<DocumentType | null> {
  const { rowCount } = await client.query(
    `UPDATE pa_document_types
        SET name        = $3,
            code        = $4,
            description = $5,
            status      = $6,
            updated_by  = $7,
            updated_at  = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, input.name, input.code, input.description, input.status, userId]
  );
  if (!rowCount) return null;
  return getDocumentType(client, id);
}

/**
 * Soft delete.
 *
 * Refused by the controller while anything still references the type — an
 * agreement keeps its snapshot, but a template pointing at a vanished type
 * would be a document you cannot save without reclassifying it, discovered at
 * the worst moment.
 */
export async function deleteDocumentType(
  client: TenantClient,
  id: string,
  userId: string | null
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pa_document_types
        SET deleted_at = now(), updated_by = $3
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, userId]
  );
  return Boolean(rowCount);
}

/** How many live templates and agreements still point at this type. */
export async function usageOf(
  client: TenantClient,
  id: string
): Promise<{ templates: number; agreements: number }> {
  const { rows } = await client.query<{ templates: string; agreements: string }>(
    `SELECT (SELECT count(*) FROM pa_agreement_templates t
              WHERE t.tenant_id = $1 AND t.document_type_id = $2 AND t.deleted_at IS NULL) AS templates,
            (SELECT count(*) FROM pa_agreements a
              WHERE a.tenant_id = $1 AND a.document_type_id = $2 AND a.deleted_at IS NULL) AS agreements`,
    [client.tenantId, id]
  );
  return {
    templates: Number(rows[0]?.templates ?? 0),
    agreements: Number(rows[0]?.agreements ?? 0),
  };
}
