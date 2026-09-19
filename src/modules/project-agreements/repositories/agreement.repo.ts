// src/modules/project-agreements/repositories/agreement.repo.ts
//
// The documents themselves.
//
// `content_html` is a SNAPSHOT — the template body already rendered with this
// project's answers. Reads never re-render it. An agreement is a legal
// artefact: editing the template afterwards must not change what the parties
// agreed. `template_version` records the revision it was frozen from.
//
// Values are stored alongside it so reopening the composer shows the same form,
// filled in. They exist to EDIT the document, not to re-derive it.

import { TenantClient } from '../db/pool';
import { Agreement, AgreementStatus, SummaryFieldKey } from '../types';

export interface AgreementInput {
  documentTypeId: string;
  documentTypeName: string | null;
  documentTypeCode: string | null;
  /** null when the document is not raised against a project. */
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  templateId: string | null;
  templateName: string | null;
  templateVersion: number | null;
  title: string;
  summaryTitle: string | null;
  documentNumber: string | null;
  contentHtml: string;
  status: AgreementStatus;
  effectiveDate: string | null;
  expiryDate: string | null;
  documentDate: string | null;
  kickoffDate: string | null;
  totalValue: number | null;
  valueCurrency: string | null;
  clientId: string | null;
  clientCompany: string | null;
  clientContactId: string | null;
  partyName: string | null;
  partyEmail: string | null;
  partyPhone: string | null;
  signatoryName: string | null;
  signatoryPosition: string | null;
  /** The entity WE sign for. null falls back to the letterhead at render time. */
  signatoryCompany: string | null;
  clientSignatoryName: string | null;
  clientSignatoryPosition: string | null;
  /** The entity THEY sign for. null falls back to the Client row. */
  clientSignatoryCompany: string | null;
  showSignatures: boolean;
  summaryFields: SummaryFieldKey[] | null;
  notes: string | null;
  values: Record<string, string>;
}

const COLUMNS = `
  a.id,
  a.document_type_id   AS "documentTypeId",
  a.document_type_name AS "documentTypeName",
  a.document_type_code AS "documentTypeCode",
  a.project_id       AS "projectId",
  a.project_name     AS "projectName",
  a.project_code     AS "projectCode",
  a.template_id      AS "templateId",
  a.template_name    AS "templateName",
  a.template_version AS "templateVersion",
  a.title,
  a.summary_title    AS "summaryTitle",
  a.document_number  AS "documentNumber",
  a.status,
  to_char(a.effective_date, 'YYYY-MM-DD') AS "effectiveDate",
  to_char(a.expiry_date,    'YYYY-MM-DD') AS "expiryDate",
  to_char(a.document_date,  'YYYY-MM-DD') AS "documentDate",
  to_char(a.kickoff_date,   'YYYY-MM-DD') AS "kickoffDate",
  a.total_value      AS "totalValue",
  a.value_currency   AS "valueCurrency",
  a.party_name       AS "partyName",
  a.party_email      AS "partyEmail",
  a.party_phone      AS "partyPhone",
  a.signatory_name        AS "signatoryName",
  a.signatory_position    AS "signatoryPosition",
  a.signatory_company     AS "signatoryCompany",
  a.client_signatory_name AS "clientSignatoryName",
  a.client_signatory_position AS "clientSignatoryPosition",
  a.client_signatory_company AS "clientSignatoryCompany",
  a.client_id         AS "clientId",
  a.client_company    AS "clientCompany",
  a.client_contact_id AS "clientContactId",
  a.show_signatures       AS "showSignatures",
  a.summary_fields   AS "summaryFields",
  a.notes,
  a.pdf_url          AS "pdfUrl",
  a.pdf_generated_at AS "pdfGeneratedAt",
  a.portal_viewed_at AS "portalViewedAt",
  a.created_by       AS "createdBy",
  a.created_at       AS "createdAt",
  a.updated_at       AS "updatedAt"
`;

export interface AgreementFilters {
  projectId?: string;
  /** Every document addressed to one client — the client detail page. */
  clientId?: string;
  status?: AgreementStatus;
  templateId?: string;
  documentTypeId?: string;
  search?: string;
  /** Live documents lapsing within N days — the rail's "Expiring soon" view. */
  expiringWithinDays?: number;
}

/**
 * The list view. content_html is deliberately NOT selected: a page of twenty
 * contracts would otherwise ship several megabytes of body HTML to render
 * twenty rows of metadata.
 */
export async function listAgreements(
  client: TenantClient,
  filters: AgreementFilters = {}
): Promise<Agreement[]> {
  const params: any[] = [client.tenantId];
  const where = ['a.tenant_id = $1', 'a.deleted_at IS NULL'];

  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`a.project_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`a.status = $${params.length}`);
  }
  if (filters.templateId) {
    params.push(filters.templateId);
    where.push(`a.template_id = $${params.length}`);
  }
  if (filters.documentTypeId) {
    params.push(filters.documentTypeId);
    where.push(`a.document_type_id = $${params.length}`);
  }
  if (filters.clientId) {
    params.push(filters.clientId);
    where.push(`a.client_id = $${params.length}`);
  }
  if (filters.expiringWithinDays !== undefined) {
    // Only ACTIVE documents can lapse. A draft with a date in the past is not
    // an expiry, it is a draft, and listing it as one buries the real ones.
    params.push(filters.expiringWithinDays);
    where.push(
      `a.status = 'active'
       AND a.expiry_date IS NOT NULL
       AND a.expiry_date >= CURRENT_DATE
       AND a.expiry_date <= CURRENT_DATE + ($${params.length}::int * INTERVAL '1 day')`
    );
  }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(a.title) LIKE $${i}
        OR lower(COALESCE(a.document_number, '')) LIKE $${i}
        OR lower(COALESCE(a.project_name, '')) LIKE $${i}
        OR lower(COALESCE(a.party_name, '')) LIKE $${i})`
    );
  }

  const { rows } = await client.query<Agreement>(
    `SELECT ${COLUMNS}, '' AS "contentHtml"
       FROM pa_agreements a
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC`,
    params
  );
  return rows;
}

export async function getAgreement(
  client: TenantClient,
  id: string
): Promise<Agreement | null> {
  const { rows } = await client.query<Agreement>(
    `SELECT ${COLUMNS},
            a.content_html AS "contentHtml",
            COALESCE((
              SELECT json_object_agg(v.key, v.value)
                FROM pa_agreement_values v
               WHERE v.agreement_id = a.id
            ), '{}'::json) AS values
       FROM pa_agreements a
      WHERE a.tenant_id = $1 AND a.id = $2 AND a.deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ?? null;
}

export async function createAgreement(
  client: TenantClient,
  input: AgreementInput,
  userId: string | null
): Promise<Agreement> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO pa_agreements
       (tenant_id, project_id, project_name, project_code,
        template_id, template_name, template_version,
        title, document_number, content_html, status,
        effective_date, expiry_date, party_name, party_email, notes,
        document_date, kickoff_date, total_value, value_currency,
        party_phone, summary_fields,
        signatory_name, signatory_position, client_signatory_name, show_signatures,
        summary_title,
        signatory_company, client_signatory_company,
        client_id, client_company, client_contact_id,
        client_signatory_position,
        document_type_id, document_type_name, document_type_code,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12::date, $13::date, $14, $15, $16,
             $17::date, $18::date, $19, $20, $21, $22,
             $23, $24, $25, $26,
             $27,
             $28, $29,
             $30, $31, $32,
             $33,
             $34, $35, $36,
             $37, $37)
     RETURNING id`,
    [
      client.tenantId,
      input.projectId,
      input.projectName,
      input.projectCode,
      input.templateId,
      input.templateName,
      input.templateVersion,
      input.title,
      input.documentNumber,
      input.contentHtml,
      input.status,
      input.effectiveDate,
      input.expiryDate,
      input.partyName,
      input.partyEmail,
      input.notes,
      input.documentDate,
      input.kickoffDate,
      input.totalValue,
      input.valueCurrency,
      input.partyPhone,
      input.summaryFields,
      input.signatoryName,
      input.signatoryPosition,
      input.clientSignatoryName,
      // Defaulted HERE, not left to the caller. show_signatures is NOT NULL, so
      // an omitted value reaches Postgres as null and the insert dies — the
      // column's own DEFAULT never applies once the INSERT names the column.
      input.showSignatures ?? true,
      input.summaryTitle,
      input.signatoryCompany,
      input.clientSignatoryCompany,
      input.clientId,
      input.clientCompany,
      input.clientContactId,
      input.clientSignatoryPosition,
      input.documentTypeId,
      input.documentTypeName,
      input.documentTypeCode,
      userId,
    ]
  );
  const id = rows[0].id;
  await replaceValues(client, id, input.values);
  return (await getAgreement(client, id))!;
}

export async function updateAgreement(
  client: TenantClient,
  id: string,
  input: AgreementInput,
  userId: string | null
): Promise<Agreement | null> {
  const { rowCount } = await client.query(
    `UPDATE pa_agreements
        SET project_id       = $3,
            project_name     = $4,
            project_code     = $5,
            template_id      = $6,
            template_name    = $7,
            template_version = $8,
            title            = $9,
            document_number  = $10,
            content_html     = $11,
            status           = $12,
            effective_date   = $13::date,
            expiry_date      = $14::date,
            party_name       = $15,
            party_email      = $16,
            notes            = $17,
            document_date    = $18::date,
            kickoff_date     = $19::date,
            total_value      = $20,
            value_currency   = $21,
            party_phone      = $22,
            summary_fields   = $23,
            signatory_name        = $24,
            signatory_position    = $25,
            client_signatory_name = $26,
            show_signatures       = $27,
            summary_title         = $28,
            signatory_company        = $29,
            client_signatory_company = $30,
            client_id                = $31,
            client_company           = $32,
            client_contact_id        = $33,
            client_signatory_position = $34,
            document_type_id   = $36,
            document_type_name = $37,
            document_type_code = $38,
            updated_by       = $35,
            updated_at       = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [
      client.tenantId,
      id,
      input.projectId,
      input.projectName,
      input.projectCode,
      input.templateId,
      input.templateName,
      input.templateVersion,
      input.title,
      input.documentNumber,
      input.contentHtml,
      input.status,
      input.effectiveDate,
      input.expiryDate,
      input.partyName,
      input.partyEmail,
      input.notes,
      input.documentDate,
      input.kickoffDate,
      input.totalValue,
      input.valueCurrency,
      input.partyPhone,
      input.summaryFields,
      input.signatoryName,
      input.signatoryPosition,
      input.clientSignatoryName,
      // Defaulted HERE, not left to the caller. show_signatures is NOT NULL, so
      // an omitted value reaches Postgres as null and the insert dies — the
      // column's own DEFAULT never applies once the INSERT names the column.
      input.showSignatures ?? true,
      input.summaryTitle,
      input.signatoryCompany,
      input.clientSignatoryCompany,
      input.clientId,
      input.clientCompany,
      input.clientContactId,
      input.clientSignatoryPosition,
      userId,
      input.documentTypeId,
      input.documentTypeName,
      input.documentTypeCode,
    ]
  );
  if (!rowCount) return null;

  await replaceValues(client, id, input.values);
  return getAgreement(client, id);
}

export async function setAgreementStatus(
  client: TenantClient,
  id: string,
  status: AgreementStatus,
  userId: string | null
): Promise<Agreement | null> {
  const { rowCount } = await client.query(
    `UPDATE pa_agreements
        SET status = $3, updated_by = $4, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, status, userId]
  );
  return rowCount ? getAgreement(client, id) : null;
}

export async function recordPdf(
  client: TenantClient,
  id: string,
  pdfUrl: string
): Promise<void> {
  await client.query(
    `UPDATE pa_agreements
        SET pdf_url = $3, pdf_generated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, pdfUrl]
  );
}

export async function deleteAgreement(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pa_agreements
        SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return Boolean(rowCount);
}

/**
 * The next document reference, as ZITH-2026-001.
 *
 * THE PREFIX IS DERIVED FROM THE COMPANY NAME on the letterhead — the first
 * four letters, uppercased ("Zithtech" → ZITH). That keeps the reference
 * recognisably the company's without asking anyone to configure a code, and
 * falls back to AGR when no letterhead has been filled in yet.
 *
 * ONE CONSEQUENCE WORTH KNOWING: renaming the company changes the prefix for
 * NEW references. Existing ones are stored on their rows and never move, so a
 * rename splits the series rather than rewriting history — which is the safe
 * direction, but it does mean a tenant that rebrands mid-year gets two runs.
 *
 * The counter is derived from the highest number already issued under THIS
 * prefix this year rather than a counter table, so importing historical
 * documents with their own numbers cannot leave a sequence out of step with
 * reality. Collisions are still possible under concurrency; the unique index
 * refuses them and the caller sees a 409 rather than two contracts sharing a
 * reference.
 */
export async function nextDocumentNumber(client: TenantClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${await referencePrefix(client)}-${year}-`;

  const { rows } = await client.query<{ max: string | null }>(
    `SELECT max(substring(document_number from '[0-9]+$')) AS max
       FROM pa_agreements
      WHERE tenant_id = $1
        AND document_number LIKE $2
        AND document_number ~ ('^' || $3 || '[0-9]+$')`,
    [client.tenantId, `${prefix}%`, prefix]
  );
  const next = (Number(rows[0]?.max ?? 0) || 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

/** "Zithtech" → "ZITH". Letters only, so "Acme & Co." cannot smuggle punctuation
 *  into a reference the regex above then fails to match. */
async function referencePrefix(client: TenantClient): Promise<string> {
  const { rows } = await client.query<{ company_name: string | null }>(
    `SELECT company_name FROM pa_branding WHERE tenant_id = $1`,
    [client.tenantId]
  );
  const letters = (rows[0]?.company_name ?? '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  return letters.slice(0, 4) || 'AGR';
}

/** Counts for the dashboard strip above the list. */
/** Live documents lapsing inside this window count as "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

/**
 * The counts behind the rail.
 *
 * Deliberately UNFILTERED — these describe the whole tenant, so the numbers
 * beside each view stay still while you move between views. A count that
 * shrinks because you clicked it is not a count, it is a echo.
 */
export async function agreementStats(
  client: TenantClient,
  /**
   * Scope the status breakdown to one document type.
   *
   * The rail's selection, and ONLY that. Status, search and project stay out
   * of it on purpose: those are the things the chips are there to tell you
   * about, and folding them in would leave every chip but one reading zero.
   */
  documentTypeId?: string
): Promise<Record<string, number> & { byType: Record<string, number> }> {
  // The type scope applies to the status counts and the expiry count. byType
  // is always tenant-wide, because it is what the rail itself is counting.
  const scope = documentTypeId ? ' AND document_type_id = $2' : '';
  const scoped: any[] = documentTypeId
    ? [client.tenantId, documentTypeId]
    : [client.tenantId];

  const { rows } = await client.query<{ status: string; count: string }>(
    `SELECT status, count(*)::text AS count
       FROM pa_agreements
      WHERE tenant_id = $1 AND deleted_at IS NULL${scope}
      GROUP BY status`,
    scoped
  );
  const stats: Record<string, number> = {
    total: 0,
    draft: 0,
    pending: 0,
    active: 0,
    expired: 0,
    terminated: 0,
    expiringSoon: 0,
    untyped: 0,
  };
  for (const r of rows) {
    stats[r.status] = Number(r.count);
    stats.total += Number(r.count);
  }

  const soonParam = `$${scoped.length + 1}`;
  const { rows: soon } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM pa_agreements
      WHERE tenant_id = $1 AND deleted_at IS NULL${scope}
        AND status = 'active'
        AND expiry_date IS NOT NULL
        AND expiry_date >= CURRENT_DATE
        AND expiry_date <= CURRENT_DATE + (${soonParam}::int * INTERVAL '1 day')`,
    [...scoped, EXPIRING_SOON_DAYS]
  );
  stats.expiringSoon = Number(soon[0]?.count ?? 0);

  // Rows raised before Document Types existed. Surfaced so the backlog is
  // visible and finite rather than a surprise at the next save.
  const { rows: untyped } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM pa_agreements
      WHERE tenant_id = $1 AND deleted_at IS NULL AND document_type_id IS NULL`,
    [client.tenantId]
  );
  stats.untyped = Number(untyped[0]?.count ?? 0);

  const { rows: byTypeRows } = await client.query<{ id: string; count: string }>(
    `SELECT document_type_id AS id, count(*)::text AS count
       FROM pa_agreements
      WHERE tenant_id = $1 AND deleted_at IS NULL AND document_type_id IS NOT NULL
      GROUP BY document_type_id`,
    [client.tenantId]
  );
  const byType: Record<string, number> = {};
  for (const r of byTypeRows) byType[r.id] = Number(r.count);

  return { ...stats, byType } as Record<string, number> & { byType: Record<string, number> };
}

async function replaceValues(
  client: TenantClient,
  agreementId: string,
  values: Record<string, string>
): Promise<void> {
  await client.query(`DELETE FROM pa_agreement_values WHERE agreement_id = $1`, [agreementId]);

  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return;

  const params: any[] = [];
  const tuples = entries.map(([key, value], i) => {
    const o = i * 4;
    params.push(client.tenantId, agreementId, key, value ?? '');
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`;
  });

  await client.query(
    `INSERT INTO pa_agreement_values (tenant_id, agreement_id, key, value)
     VALUES ${tuples.join(', ')}`,
    params
  );
}
