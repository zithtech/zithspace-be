// src/modules/yapiez/repositories/catalog.repo.ts
// Collections + API definitions — the developer-owned half of Yapiez.

import { TenantClient } from '../db/pool';
import { YapiezError } from '../types';

/**
 * Turn Postgres' unique-violation into the 409 the caller can act on.
 *
 * `yapiez_collections_name_uidx` is on (tenant_id, lower(name)), so this fires
 * on a case-different duplicate too — which is exactly the case a client-side
 * check tends to miss.
 */
/**
 * Restrict to one project, keeping rows that belong to no project.
 *
 * A NULL project_id means "shared across every project", not "unassigned" —
 * a common Auth collection should show up wherever you are working. Excluding
 * NULLs would hide exactly the definitions most worth reusing.
 */
function projectClause(column: string, projectId: string, params: any[]): string {
  params.push(projectId);
  return `(${column} = $${params.length} OR ${column} IS NULL)`;
}

function rethrowDuplicate(err: any, what: string): never {
  if (err?.code === '23505') {
    throw YapiezError.conflict(
      what === 'collection'
        ? 'A collection with that name already exists in this source.'
        : `A ${what} with that name already exists.`
    );
  }
  throw err;
}
import { ApiDto, CollectionDto, toApi, toCollection } from './mappers';
import { CollectionCreateInput, CollectionUpdateInput } from '../validators';

// ─── Collections ────────────────────────────────────────────────────────────

export async function listCollections(
  c: TenantClient,
  filters: { sourceId?: string; projectId?: string; includeUnfiled?: boolean } = {}
): Promise<CollectionDto[]> {
  const params: any[] = [c.tenantId];
  let projectFilter = '';
  if (filters.projectId) {
    projectFilter = ` AND ${projectClause('col.project_id', filters.projectId, params)}`;
  }
  let sourceFilter = '';
  if (filters.sourceId) {
    params.push(filters.sourceId);
    // "Unfiled" collections belong to every source's picker, because a
    // collection with no tier is still a legitimate place to file an API.
    sourceFilter = filters.includeUnfiled
      ? ` AND (col.source_id = $${params.length} OR col.source_id IS NULL)`
      : ` AND col.source_id = $${params.length}`;
  }

  const { rows } = await c.query(
    `SELECT col.*, src.label AS source_label, src.color AS source_color,
            proj.name AS project_name,
            (SELECT COUNT(*) FROM yapiez_apis a
              WHERE a.collection_id = col.id AND a.tenant_id = col.tenant_id) AS api_count,
            -- What the collection is MADE of, for the catalog card. A count
            -- alone says how big it is; the verb mix says what it does.
            (SELECT COALESCE(json_object_agg(m.method, m.n), '{}'::json)
               FROM (SELECT a2.method, COUNT(*)::int AS n
                       FROM yapiez_apis a2
                      WHERE a2.collection_id = col.id AND a2.tenant_id = col.tenant_id
                      GROUP BY a2.method) m) AS method_counts
       FROM yapiez_collections col
       LEFT JOIN yapiez_sources src ON src.id = col.source_id
       LEFT JOIN projects proj ON proj.id = col.project_id
      WHERE col.tenant_id = $1${projectFilter}${sourceFilter}
      ORDER BY src.sort ASC NULLS LAST, col.name ASC`,
    params
  );
  return rows.map(toCollection);
}

export async function createCollection(
  c: TenantClient,
  userId: string,
  input: CollectionCreateInput
): Promise<CollectionDto> {
  try {
    const { rows } = await c.query(
      `INSERT INTO yapiez_collections (tenant_id, name, source_id, description, project_id, color, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [
        c.tenantId,
        input.name,
        input.sourceId ?? null,
        input.description ?? null,
        input.projectId ?? null,
        input.color ?? null,
        userId,
      ]
    );
    return toCollection(rows[0]);
  } catch (err) {
    rethrowDuplicate(err, 'collection');
  }
}

export async function updateCollection(
  c: TenantClient,
  userId: string,
  id: string,
  input: CollectionUpdateInput
): Promise<CollectionDto> {
  try {
    const { rows } = await c.query(
      `UPDATE yapiez_collections
          SET name        = COALESCE($3, name),
              -- source_id and project_id are set unconditionally so a
              -- collection can be moved back to unfiled or to shared;
              -- COALESCE would make clearing either one impossible.
              source_id   = $4,
              description = COALESCE($5, description),
              project_id  = $6,
              color       = COALESCE($7, color),
              updated_by  = $8
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [
        id,
        c.tenantId,
        input.name ?? null,
        input.sourceId ?? null,
        input.description ?? null,
        input.projectId ?? null,
        input.color ?? null,
        userId,
      ]
    );
    if (!rows[0]) throw YapiezError.notFound('Collection');
    return toCollection(rows[0]);
  } catch (err) {
    rethrowDuplicate(err, 'collection');
  }
}

export async function deleteCollection(c: TenantClient, id: string): Promise<void> {
  const { rowCount } = await c.query(
    `DELETE FROM yapiez_collections WHERE id = $1 AND tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound('Collection');
}

// ─── API definitions ────────────────────────────────────────────────────────

export interface ApiListFilters {
  search?: string;
  collectionId?: string;
  /** Filters through the collection — an API's tier is its collection's tier. */
  sourceId?: string;
  method?: string;
  projectId?: string;
  /** Projects the caller may see; NULL-project definitions are always shown. */
  allowedProjects?: string[];
  includeDeprecated?: boolean;
}

/**
 * The catalog listing. `used_in_flows` is computed so the UI can warn before a
 * developer deletes a definition QA has already built flows on.
 */
export async function listApis(
  c: TenantClient,
  filters: ApiListFilters,
  page: { limit: number; offset: number }
): Promise<{ items: ApiDto[]; total: number }> {
  const params: any[] = [c.tenantId];
  const where: string[] = ['a.tenant_id = $1'];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(a.name ILIKE $${params.length} OR a.url ILIKE $${params.length} OR a.description ILIKE $${params.length})`);
  }
  if (filters.collectionId) {
    params.push(filters.collectionId);
    where.push(`a.collection_id = $${params.length}`);
  }
  if (filters.sourceId) {
    params.push(filters.sourceId);
    where.push(`col.source_id = $${params.length}`);
  }
  if (filters.method) {
    params.push(filters.method.toUpperCase());
    where.push(`a.method = $${params.length}`);
  }
  if (filters.projectId) {
    // The API's own project, not its collection's: an unfiled definition still
    // belongs somewhere, and the two are kept in step when either is set.
    where.push(projectClause('a.project_id', filters.projectId, params));
  }
  if (filters.allowedProjects?.length) {
    // Mirrors the Test Runs list: the caller passes the projects the user may
    // see. Presentation-level scoping, consistent with the rest of QA Space —
    // it is not a substitute for a permission check.
    params.push(filters.allowedProjects);
    where.push(`(a.project_id IS NULL OR a.project_id = ANY($${params.length}::text[]))`);
  }
  if (!filters.includeDeprecated) {
    where.push('a.is_deprecated = FALSE');
  }

  const whereSql = where.join(' AND ');

  const countSql = `SELECT COUNT(*)::int AS total
                      FROM yapiez_apis a
                      LEFT JOIN yapiez_collections col ON col.id = a.collection_id
                      LEFT JOIN yapiez_sources src ON src.id = col.source_id
                      LEFT JOIN projects proj ON proj.id = a.project_id
                     WHERE ${whereSql}`;
  const { rows: countRows } = await c.query(countSql, params);

  params.push(page.limit, page.offset);
  const { rows } = await c.query(
    `SELECT a.*, col.name AS collection_name, proj.name AS project_name,
            col.source_id, src.label AS source_label, src.color AS source_color,
            (SELECT COUNT(*) FROM yapiez_flow_steps s WHERE s.api_id = a.id) AS used_in_flows
       FROM yapiez_apis a
       LEFT JOIN yapiez_collections col ON col.id = a.collection_id
       LEFT JOIN yapiez_sources src ON src.id = col.source_id
       LEFT JOIN projects proj ON proj.id = a.project_id
      WHERE ${whereSql}
      ORDER BY a.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { items: rows.map(toApi), total: countRows[0]?.total ?? 0 };
}

export async function getApi(c: TenantClient, id: string): Promise<ApiDto> {
  const { rows } = await c.query(
    `SELECT a.*, col.name AS collection_name, proj.name AS project_name,
            col.source_id, src.label AS source_label, src.color AS source_color,
            (SELECT COUNT(*) FROM yapiez_flow_steps s WHERE s.api_id = a.id) AS used_in_flows
       FROM yapiez_apis a
       LEFT JOIN yapiez_collections col ON col.id = a.collection_id
       LEFT JOIN yapiez_sources src ON src.id = col.source_id
       LEFT JOIN projects proj ON proj.id = a.project_id
      WHERE a.id = $1 AND a.tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rows[0]) throw YapiezError.notFound('API');
  return toApi(rows[0]);
}

/** The columns an API write touches, in the order both statements below use. */
const API_WRITE_COLUMNS = [
  'collection_id',
  'project_id',
  'name',
  'description',
  'method',
  'url',
  'headers',
  'query_params',
  'path_params',
  'body_type',
  'request_body',
  'sample_data',
  'auth_type',
  'auth_config',
  'expected_status',
  'expected_response',
  'response_schema',
  'default_assertions',
  'timeout_ms',
  'tags',
  'owner_id',
  'notes',
  'is_deprecated',
] as const;

function apiWriteValues(input: any): any[] {
  return [
    input.collectionId ?? null,
    input.projectId ?? null,
    input.name,
    input.description ?? null,
    String(input.method).toUpperCase(),
    input.url,
    JSON.stringify(input.headers ?? []),
    JSON.stringify(input.queryParams ?? []),
    JSON.stringify(input.pathParams ?? []),
    input.bodyType ?? 'none',
    input.requestBody ?? null,
    JSON.stringify(input.sampleData ?? {}),
    input.authType ?? 'inherit',
    JSON.stringify(input.authConfig ?? {}),
    input.expectedStatus ?? null,
    input.expectedResponse ?? null,
    JSON.stringify(input.responseSchema ?? {}),
    JSON.stringify(input.defaultAssertions ?? []),
    input.timeoutMs ?? null,
    input.tags ?? [],
    input.ownerId ?? null,
    input.notes ?? null,
    input.isDeprecated ?? false,
  ];
}

export async function createApi(c: TenantClient, userId: string, input: any): Promise<ApiDto> {
  const values = apiWriteValues(input);
  // $1 tenant, $2 created_by, then the write columns from $3.
  const placeholders = API_WRITE_COLUMNS.map((_, i) => `$${i + 3}`).join(', ');
  const { rows } = await c.query(
    `INSERT INTO yapiez_apis (tenant_id, created_by, updated_by, ${API_WRITE_COLUMNS.join(', ')})
     VALUES ($1, $2, $2, ${placeholders})
     RETURNING *`,
    [c.tenantId, userId, ...values]
  );
  return toApi(rows[0]);
}

export async function updateApi(c: TenantClient, userId: string, id: string, input: any): Promise<ApiDto> {
  const values = apiWriteValues(input);
  const assignments = API_WRITE_COLUMNS.map((col, i) => `${col} = $${i + 4}`).join(', ');
  const { rows } = await c.query(
    `UPDATE yapiez_apis
        SET ${assignments}, updated_by = $3
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [id, c.tenantId, userId, ...values]
  );
  if (!rows[0]) throw YapiezError.notFound('API');
  return toApi(rows[0]);
}

/**
 * Deleting a definition a flow still points at is refused rather than
 * cascaded — losing a step silently would change what a flow tests without
 * anyone being told. The API can be marked deprecated instead.
 */
export async function deleteApi(c: TenantClient, id: string): Promise<void> {
  const { rows } = await c.query(
    `SELECT f.name
       FROM yapiez_flow_steps s
       JOIN yapiez_flows f ON f.id = s.flow_id
      WHERE s.api_id = $1 AND s.tenant_id = $2
      GROUP BY f.name
      LIMIT 5`,
    [id, c.tenantId]
  );
  if (rows.length) {
    const names = rows.map((r: any) => `"${r.name}"`).join(', ');
    throw YapiezError.conflict(
      `This API is used by ${names}. Remove it from those flows first, or mark it deprecated instead of deleting it.`
    );
  }

  const { rowCount } = await c.query(
    `DELETE FROM yapiez_apis WHERE id = $1 AND tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound('API');
}

/** Catalog counters for the Yapiez landing header. */
export async function apiStats(c: TenantClient): Promise<Record<string, number>> {
  const { rows } = await c.query(
    `SELECT
       (SELECT COUNT(*) FROM yapiez_apis WHERE tenant_id = $1 AND is_deprecated = FALSE)::int AS apis,
       (SELECT COUNT(*) FROM yapiez_collections WHERE tenant_id = $1)::int AS collections,
       (SELECT COUNT(*) FROM yapiez_sources WHERE tenant_id = $1)::int AS sources,
       (SELECT COUNT(*) FROM yapiez_flows WHERE tenant_id = $1 AND status <> 'Archived')::int AS flows,
       (SELECT COUNT(*) FROM yapiez_environments WHERE tenant_id = $1)::int AS environments,
       (SELECT COUNT(*) FROM yapiez_flow_runs WHERE tenant_id = $1)::int AS runs,
       (SELECT COUNT(*) FROM yapiez_flow_runs WHERE tenant_id = $1 AND status = 'Failed')::int AS failed_runs`,
    [c.tenantId]
  );
  return rows[0] ?? {};
}
