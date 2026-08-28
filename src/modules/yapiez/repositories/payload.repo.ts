// src/modules/yapiez/repositories/payload.repo.ts
//
// Request payloads kept against a module test case — the Positive / Negative /
// Valid / Invalid bodies a tester reads off the case instead of writing one
// from scratch at the keyboard.
//
// See migrations/007 for why the table lives in Yapiez and why `test_case_id`
// is nullable.

import { TenantClient } from '../db/pool';
import { YapiezError } from '../types';
import { CasePayloadDto, toCasePayload } from './mappers';
import { PayloadCreateInput, PayloadUpdateInput } from '../validators';

export interface PayloadListFilters {
  testCaseId?: string;
  parentTestCaseId?: string;
  apiId?: string;
  moduleName?: string;
  projectId?: string;
  payloadType?: string;
  /** Only the ones not yet adopted by a case — the create drawer's own drafts. */
  unlinkedOnly?: boolean;
}

const SELECT = `
  SELECT p.*, u.name AS created_by_name
    FROM yapiez_case_payloads p
    LEFT JOIN users u ON u.id::text = p.created_by::text`;

export async function listPayloads(
  c: TenantClient,
  filters: PayloadListFilters
): Promise<CasePayloadDto[]> {
  const params: any[] = [c.tenantId];
  const where: string[] = ['p.tenant_id = $1'];

  if (filters.testCaseId) {
    params.push(filters.testCaseId);
    where.push(`p.test_case_id = $${params.length}`);
  }
  if (filters.parentTestCaseId) {
    params.push(filters.parentTestCaseId);
    where.push(`p.parent_test_case_id = $${params.length}`);
  }
  if (filters.apiId) {
    params.push(filters.apiId);
    where.push(`p.api_id = $${params.length}`);
  }
  if (filters.moduleName) {
    params.push(filters.moduleName);
    // Case-insensitive, like the rest of the catalog: settings may have
    // re-cased a module since the payload was filed under it.
    where.push(`LOWER(TRIM(p.module_name)) = LOWER(TRIM($${params.length}))`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`(p.project_id = $${params.length} OR p.project_id IS NULL)`);
  }
  if (filters.payloadType) {
    params.push(filters.payloadType);
    where.push(`p.payload_type = $${params.length}`);
  }
  if (filters.unlinkedOnly) {
    where.push('p.test_case_id IS NULL');
  }

  const { rows } = await c.query(
    `${SELECT} WHERE ${where.join(' AND ')}
      ORDER BY p.created_at ASC`,
    params
  );
  return rows.map(toCasePayload);
}

/**
 * Every payload for a set of cases, in one round trip.
 *
 * The case list renders a payload count per row; asking per row would be one
 * query per visible case.
 */
export async function listPayloadsForCases(
  c: TenantClient,
  caseIds: string[]
): Promise<Record<string, CasePayloadDto[]>> {
  if (!caseIds.length) return {};
  const { rows } = await c.query(
    `${SELECT} WHERE p.tenant_id = $1 AND p.test_case_id = ANY($2::uuid[])
      ORDER BY p.created_at ASC`,
    [c.tenantId, caseIds]
  );
  const byCase: Record<string, CasePayloadDto[]> = {};
  for (const row of rows) {
    const dto = toCasePayload(row);
    const key = dto.testCaseId as string;
    (byCase[key] ??= []).push(dto);
  }
  return byCase;
}

export async function getPayload(c: TenantClient, id: string): Promise<CasePayloadDto> {
  const { rows } = await c.query(`${SELECT} WHERE p.id = $1 AND p.tenant_id = $2`, [id, c.tenantId]);
  if (!rows[0]) throw YapiezError.notFound('Payload');
  return toCasePayload(rows[0]);
}

/**
 * Store a confirmed payload.
 *
 * The API's name, method and url are copied in rather than joined on read —
 * `api_id` goes NULL when a definition is retired, and a payload whose endpoint
 * no longer reads back is not evidence of anything.
 */
export async function createPayload(
  c: TenantClient,
  userId: string,
  input: PayloadCreateInput,
  api: { name: string; method: string; url: string; projectId: string | null; moduleName: string | null }
): Promise<CasePayloadDto> {
  const { rows } = await c.query(
    `INSERT INTO yapiez_case_payloads
       (tenant_id, api_id, api_name, api_method, api_url,
        test_case_id, parent_test_case_id, project_id, module_name,
        payload_type, name, payload, expected_status, notes, generated_by,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $16)
     RETURNING *`,
    [
      c.tenantId,
      input.apiId,
      api.name,
      api.method,
      api.url,
      input.testCaseId ?? null,
      input.parentTestCaseId ?? null,
      api.projectId,
      api.moduleName,
      input.payloadType,
      input.name,
      JSON.stringify(input.payload ?? {}),
      input.expectedStatus ?? null,
      input.notes ?? null,
      input.generatedBy ?? 'manual',
      userId,
    ]
  );
  return toCasePayload(rows[0]);
}

export async function updatePayload(
  c: TenantClient,
  userId: string,
  id: string,
  input: PayloadUpdateInput
): Promise<CasePayloadDto> {
  const sets: string[] = [];
  const params: any[] = [];

  const set = (column: string, value: any, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };

  if (input.payloadType !== undefined) set('payload_type', input.payloadType);
  if (input.name !== undefined) set('name', input.name);
  if (input.payload !== undefined) set('payload', JSON.stringify(input.payload), '::jsonb');
  if (input.expectedStatus !== undefined) set('expected_status', input.expectedStatus ?? null);
  if (input.notes !== undefined) set('notes', input.notes ?? null);

  if (!sets.length) return getPayload(c, id);

  set('updated_by', userId);
  params.push(id, c.tenantId);

  const { rows } = await c.query(
    `UPDATE yapiez_case_payloads SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
      RETURNING *`,
    params
  );
  if (!rows[0]) throw YapiezError.notFound('Payload');
  return toCasePayload(rows[0]);
}

/**
 * Adopt payloads drafted before their case existed.
 *
 * Only ever moves an UNLINKED payload onto a case — re-parenting one that
 * already belongs somewhere would silently take it off the case a tester is
 * reading it from.
 */
export async function linkPayloads(
  c: TenantClient,
  userId: string,
  testCaseId: string,
  payloadIds: string[]
): Promise<number> {
  const { rowCount } = await c.query(
    `UPDATE yapiez_case_payloads
        SET test_case_id = $1, updated_by = $2
      WHERE tenant_id = $3 AND id = ANY($4::uuid[]) AND test_case_id IS NULL`,
    [testCaseId, userId, c.tenantId, payloadIds]
  );
  return rowCount ?? 0;
}

/** Hard delete — a payload is cheap to regenerate, so there is no trash for it. */
export async function deletePayload(c: TenantClient, id: string): Promise<void> {
  const { rowCount } = await c.query(
    'DELETE FROM yapiez_case_payloads WHERE id = $1 AND tenant_id = $2',
    [id, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound('Payload');
}
