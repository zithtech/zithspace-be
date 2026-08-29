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
        ? 'A collection with that name already exists in this module and source.'
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
  filters: { sourceId?: string; projectId?: string; moduleName?: string; includeUnfiled?: boolean } = {}
): Promise<CollectionDto[]> {
  const params: any[] = [c.tenantId];
  let projectFilter = '';
  if (filters.projectId) {
    projectFilter = ` AND ${projectClause('col.project_id', filters.projectId, params)}`;
  }
  let moduleFilter = '';
  if (filters.moduleName) {
    moduleFilter = ` AND ${moduleClause('col.module_name', filters.moduleName, params)}`;
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
              WHERE a.collection_id = col.id AND a.tenant_id = col.tenant_id
                AND a.deleted_at IS NULL) AS api_count,
            -- What the collection is MADE of, for the catalog card. A count
            -- alone says how big it is; the verb mix says what it does.
            (SELECT COALESCE(json_object_agg(m.method, m.n), '{}'::json)
               FROM (SELECT a2.method, COUNT(*)::int AS n
                       FROM yapiez_apis a2
                      WHERE a2.collection_id = col.id AND a2.tenant_id = col.tenant_id
                        AND a2.deleted_at IS NULL
                      GROUP BY a2.method) m) AS method_counts
       FROM yapiez_collections col
       LEFT JOIN yapiez_sources src ON src.id = col.source_id
       LEFT JOIN projects proj ON proj.id = col.project_id
      WHERE col.tenant_id = $1 AND col.deleted_at IS NULL${projectFilter}${moduleFilter}${sourceFilter}
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
      `INSERT INTO yapiez_collections
         (tenant_id, name, module_name, source_id, description, project_id, color, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING *`,
      [
        c.tenantId,
        input.name,
        String(input.moduleName ?? '').trim() || null,
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
              -- source_id, project_id and module_name are set unconditionally
              -- so a collection can be moved back to unfiled or to shared;
              -- COALESCE would make clearing any of them impossible.
              source_id   = $4,
              description = COALESCE($5, description),
              project_id  = $6,
              color       = COALESCE($7, color),
              module_name = $8,
              updated_by  = $9
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
        String(input.moduleName ?? '').trim() || null,
        userId,
      ]
    );
    if (!rows[0]) throw YapiezError.notFound('Collection');
    return toCollection(rows[0]);
  } catch (err) {
    rethrowDuplicate(err, 'collection');
  }
}

/**
 * Send a collection to the trash.
 *
 * Its endpoints are NOT touched. They keep pointing at it and simply read as
 * ungrouped while it is away, so restoring the collection puts every one of
 * them back where it was without having to remember what was in it.
 */
export async function deleteCollection(c: TenantClient, userId: string, id: string): Promise<void> {
  const { rowCount } = await c.query(
    `UPDATE yapiez_collections
        SET deleted_at = NOW(), deleted_by = $3
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, c.tenantId, userId]
  );
  if (!rowCount) throw YapiezError.notFound('Collection');
}

// ─── API definitions ────────────────────────────────────────────────────────

/**
 * The module filter value that means "definitions filed under no module".
 *
 * A sentinel rather than a separate boolean flag, so the catalog's single
 * module dropdown can offer it as one more option alongside the real names.
 */
export const UNFILED_MODULE = '__unfiled__';

export interface ApiListFilters {
  search?: string;
  collectionId?: string;
  /** The definition's own tier, falling back to its legacy collection's. */
  sourceId?: string;
  /** A QA module name, or UNFILED_MODULE for the ones filed under none. */
  moduleName?: string;
  /** Only definitions sitting directly under a module, in no collection. */
  unfiledOnly?: boolean;
  method?: string;
  /** inherit | none | bearer | basic | api_key */
  authType?: string;
  /** Show ONLY the deprecated ones — the opposite of includeDeprecated. */
  deprecatedOnly?: boolean;
  /** recent (default) | name | method | used */
  sort?: string;
  projectId?: string;
  /** Projects the caller may see; NULL-project definitions are always shown. */
  allowedProjects?: string[];
  includeDeprecated?: boolean;
}

/**
 * The tier a definition is under: its own column, or — for rows written before
 * modules replaced collections — the tier of the collection it was filed in.
 */
const EFFECTIVE_SOURCE = 'COALESCE(a.source_id, col.source_id)';

/** WHERE fragment for a module filter, including the "unfiled" sentinel. */
function moduleClause(column: string, moduleName: string, params: any[]): string {
  if (moduleName === UNFILED_MODULE) {
    return `(${column} IS NULL OR TRIM(${column}) = '')`;
  }
  params.push(moduleName);
  // Case-insensitive: settings may have re-cased a module since it was filed.
  return `LOWER(TRIM(${column})) = LOWER(TRIM($${params.length}))`;
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
  const where: string[] = ['a.tenant_id = $1', 'a.deleted_at IS NULL'];

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
    where.push(`${EFFECTIVE_SOURCE} = $${params.length}`);
  }
  if (filters.moduleName) {
    where.push(moduleClause('a.module_name', filters.moduleName, params));
  }
  if (filters.unfiledOnly) {
    where.push(`a.collection_id IS NULL`);
  }
  if (filters.method) {
    params.push(filters.method.toUpperCase());
    where.push(`a.method = $${params.length}`);
  }
  if (filters.authType) {
    params.push(filters.authType);
    where.push(`a.auth_type = $${params.length}`);
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
  if (filters.deprecatedOnly) {
    where.push('a.is_deprecated = TRUE');
  } else if (!filters.includeDeprecated) {
    where.push('a.is_deprecated = FALSE');
  }

  const whereSql = where.join(' AND ');

  /**
   * Sort is an allow-list, never interpolated from the query string — this is
   * the one clause that cannot be parameterised, so it must not be user text.
   */
  const ORDER_BY: Record<string, string> = {
    recent: 'a.updated_at DESC',
    name: 'LOWER(a.name) ASC',
    method: 'a.method ASC, LOWER(a.name) ASC',
    created: 'a.created_at DESC',
  };
  const orderBy = ORDER_BY[filters.sort ?? 'recent'] ?? ORDER_BY.recent;

  const countSql = `SELECT COUNT(*)::int AS total
                      FROM yapiez_apis a
                      LEFT JOIN yapiez_collections col ON col.id = a.collection_id AND col.deleted_at IS NULL AND col.deleted_at IS NULL AND col.deleted_at IS NULL
                      LEFT JOIN yapiez_sources src ON src.id = ${EFFECTIVE_SOURCE}
                      LEFT JOIN projects proj ON proj.id = a.project_id
                     WHERE ${whereSql}`;
  const { rows: countRows } = await c.query(countSql, params);

  params.push(page.limit, page.offset);
  const { rows } = await c.query(
    `SELECT a.*, col.name AS collection_name, proj.name AS project_name,
            ${EFFECTIVE_SOURCE} AS effective_source_id,
            src.label AS source_label, src.color AS source_color,
            (SELECT COUNT(*) FROM yapiez_flow_steps s WHERE s.api_id = a.id) AS used_in_flows
       FROM yapiez_apis a
       LEFT JOIN yapiez_collections col ON col.id = a.collection_id AND col.deleted_at IS NULL AND col.deleted_at IS NULL
       LEFT JOIN yapiez_sources src ON src.id = ${EFFECTIVE_SOURCE}
       LEFT JOIN projects proj ON proj.id = a.project_id
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { items: rows.map(toApi), total: countRows[0]?.total ?? 0 };
}

export async function getApi(c: TenantClient, id: string): Promise<ApiDto> {
  const { rows } = await c.query(
    `SELECT a.*, col.name AS collection_name, proj.name AS project_name,
            ${EFFECTIVE_SOURCE} AS effective_source_id,
            src.label AS source_label, src.color AS source_color,
            (SELECT COUNT(*) FROM yapiez_flow_steps s WHERE s.api_id = a.id) AS used_in_flows
       FROM yapiez_apis a
       LEFT JOIN yapiez_collections col ON col.id = a.collection_id AND col.deleted_at IS NULL AND col.deleted_at IS NULL
       LEFT JOIN yapiez_sources src ON src.id = ${EFFECTIVE_SOURCE}
       LEFT JOIN projects proj ON proj.id = a.project_id
      WHERE a.id = $1 AND a.tenant_id = $2 AND a.deleted_at IS NULL`,
    [id, c.tenantId]
  );
  if (!rows[0]) throw YapiezError.notFound('API');
  return toApi(rows[0]);
}

/** The columns an API write touches, in the order both statements below use. */
const API_WRITE_COLUMNS = [
  'collection_id',
  'project_id',
  'source_id',
  'module_name',
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
    input.sourceId ?? null,
    // A module is a name, so trim it — a stray space would fork the grouping.
    String(input.moduleName ?? '').trim() || null,
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

/**
 * Keep the tree honest: an API inside a collection belongs to that collection's
 * module, whatever the client sent.
 *
 * The UI already keeps the two pickers in step, but it is the only thing that
 * does — a stale tab or a direct API call would otherwise file an endpoint
 * under a module its own collection is not in, and the catalog would show it
 * in two places at once. A collection with no module of its own settles
 * nothing, so the definition keeps the module it was given.
 */
async function withCollectionModule(c: TenantClient, input: any): Promise<any> {
  if (!input.collectionId) return input;
  const { rows } = await c.query(
    `SELECT module_name FROM yapiez_collections WHERE id = $1 AND tenant_id = $2`,
    [input.collectionId, c.tenantId]
  );
  const moduleName = rows[0]?.module_name;
  return moduleName ? { ...input, moduleName } : input;
}

export async function createApi(c: TenantClient, userId: string, input: any): Promise<ApiDto> {
  const values = apiWriteValues(await withCollectionModule(c, input));
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
  const values = apiWriteValues(await withCollectionModule(c, input));
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
/**
 * Send a definition to the trash.
 *
 * No usage check here, unlike the permanent delete below: this is reversible,
 * and refusing a reversible act to protect against a reference that a restore
 * would put straight back is obstruction rather than safety.
 */
export async function deleteApi(c: TenantClient, userId: string, id: string): Promise<void> {
  const { rowCount } = await c.query(
    `UPDATE yapiez_apis
        SET deleted_at = NOW(), deleted_by = $3
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, c.tenantId, userId]
  );
  if (!rowCount) throw YapiezError.notFound('API');
}

export interface ModuleSummary {
  /** Null is the "unfiled" bucket — definitions filed under no module. */
  moduleName: string | null;
  apiCount: number;
  /** Collections sitting inside this module — the level below it. */
  collectionCount: number;
  /** APIs by HTTP method, e.g. { GET: 4, POST: 2 }. */
  methodCounts: Record<string, number>;
  updatedAt: string | null;
}

/**
 * What each module holds, for the catalog's module cards.
 *
 * Driven off the definitions rather than off `qa_todo_modules`, so a module
 * that settings no longer lists still shows the endpoints filed under it
 * instead of them vanishing from the screen. The caller merges this with the
 * curated module list to show empty modules too.
 */
export async function listModuleSummaries(
  c: TenantClient,
  filters: { projectId?: string; sourceId?: string; allowedProjects?: string[]; includeDeprecated?: boolean } = {}
): Promise<ModuleSummary[]> {
  const params: any[] = [c.tenantId];
  const where: string[] = ['a.tenant_id = $1', 'a.deleted_at IS NULL'];

  if (filters.projectId) {
    where.push(projectClause('a.project_id', filters.projectId, params));
  }
  if (filters.allowedProjects?.length) {
    params.push(filters.allowedProjects);
    where.push(`(a.project_id IS NULL OR a.project_id = ANY($${params.length}::text[]))`);
  }
  if (filters.sourceId) {
    params.push(filters.sourceId);
    where.push(`${EFFECTIVE_SOURCE} = $${params.length}`);
  }
  if (!filters.includeDeprecated) {
    where.push('a.is_deprecated = FALSE');
  }

  // Collections are counted on their own axis: a module can hold a collection
  // that has no endpoints yet, and an endpoint that sits in no collection at
  // all, so neither count can be derived from the other.
  const collectionWhere: string[] = ['col.tenant_id = $1', 'col.deleted_at IS NULL'];
  if (filters.projectId) {
    collectionWhere.push(projectClause('col.project_id', filters.projectId, params));
  }
  if (filters.sourceId) {
    params.push(filters.sourceId);
    collectionWhere.push(`(col.source_id = $${params.length} OR col.source_id IS NULL)`);
  }

  const { rows } = await c.query(
    `WITH scoped AS (
       SELECT NULLIF(TRIM(a.module_name), '') AS module_name, a.method, a.updated_at
         FROM yapiez_apis a
         LEFT JOIN yapiez_collections col ON col.id = a.collection_id AND col.deleted_at IS NULL AND col.deleted_at IS NULL
        WHERE ${where.join(' AND ')}
     ),
     per_method AS (
       SELECT module_name, method, COUNT(*)::int AS n, MAX(updated_at) AS updated_at
         FROM scoped
        GROUP BY module_name, method
     ),
     api_rollup AS (
       SELECT module_name,
              SUM(n)::int AS api_count,
              MAX(updated_at) AS updated_at,
              json_object_agg(method, n) AS method_counts
         FROM per_method
        GROUP BY module_name
     ),
     collection_rollup AS (
       SELECT NULLIF(TRIM(col.module_name), '') AS module_name,
              COUNT(*)::int AS collection_count,
              MAX(col.updated_at) AS updated_at
         FROM yapiez_collections col
        WHERE ${collectionWhere.join(' AND ')}
        GROUP BY 1
     )
     SELECT COALESCE(a.module_name, cr.module_name) AS module_name,
            COALESCE(a.api_count, 0) AS api_count,
            COALESCE(cr.collection_count, 0) AS collection_count,
            GREATEST(a.updated_at, cr.updated_at) AS updated_at,
            COALESCE(a.method_counts, '{}'::json) AS method_counts
       FROM api_rollup a
       FULL OUTER JOIN collection_rollup cr
         ON COALESCE(a.module_name, '') = COALESCE(cr.module_name, '')
      ORDER BY 1 ASC NULLS LAST`,
    params
  );

  return rows.map((row: any) => ({
    moduleName: row.module_name ?? null,
    apiCount: Number(row.api_count ?? 0),
    collectionCount: Number(row.collection_count ?? 0),
    methodCounts: (typeof row.method_counts === 'string'
      ? JSON.parse(row.method_counts)
      : row.method_counts) ?? {},
    updatedAt: row.updated_at ?? null,
  }));
}

/**
 * Unfile everything under a module, keeping it all.
 *
 * Deleting a module must not delete the endpoints documented under it — those
 * are the work; the module is only where they were filed. They become unfiled
 * and show under the catalog's "Unfiled" card, which is visible and reversible.
 */
export async function unfileModule(
  c: TenantClient,
  input: { projectId?: string; name: string }
): Promise<{ apis: number; collections: number }> {
  const run = async (table: 'yapiez_apis' | 'yapiez_collections') => {
    const params: any[] = [c.tenantId, input.name.trim()];
    const where = [`tenant_id = $1`, `deleted_at IS NULL`, `LOWER(TRIM(module_name)) = LOWER(TRIM($2))`];
    if (input.projectId) where.push(projectClause('project_id', input.projectId, params));

    const { rowCount } = await c.query(
      `UPDATE ${table} SET module_name = NULL WHERE ${where.join(' AND ')}`,
      params
    );
    return rowCount ?? 0;
  };

  return { collections: await run('yapiez_collections'), apis: await run('yapiez_apis') };
}

// ─── Trash ──────────────────────────────────────────────────────────────────

export interface TrashEntry {
  kind: 'api' | 'collection';
  id: string;
  name: string;
  /** An endpoint's method and URL; a collection's description. */
  method: string | null;
  url: string | null;
  description: string | null;
  moduleName: string | null;
  collectionName: string | null;
  projectName: string | null;
  /** For a collection: how many live endpoints come back with it. */
  itemCount: number;
  deletedAt: string;
}

/**
 * What is in the trash, newest first.
 *
 * Both levels in one list rather than two: you deleted a thing, and what kind
 * of thing it was is a detail of the row, not a reason to make you look in two
 * places for it.
 */
export async function listTrash(
  c: TenantClient,
  filters: { projectId?: string } = {}
): Promise<TrashEntry[]> {
  const apiParams: any[] = [c.tenantId];
  let apiProject = '';
  if (filters.projectId) {
    apiProject = ` AND ${projectClause('a.project_id', filters.projectId, apiParams)}`;
  }

  const { rows: apiRows } = await c.query(
    `SELECT a.id, a.name, a.method, a.url, a.description, a.module_name,
            col.name AS collection_name, proj.name AS project_name, a.deleted_at
       FROM yapiez_apis a
       LEFT JOIN yapiez_collections col ON col.id = a.collection_id
       LEFT JOIN projects proj ON proj.id = a.project_id
      WHERE a.tenant_id = $1 AND a.deleted_at IS NOT NULL${apiProject}
      ORDER BY a.deleted_at DESC
      LIMIT 200`,
    apiParams
  );

  const colParams: any[] = [c.tenantId];
  let colProject = '';
  if (filters.projectId) {
    colProject = ` AND ${projectClause('col.project_id', filters.projectId, colParams)}`;
  }

  const { rows: colRows } = await c.query(
    `SELECT col.id, col.name, col.description, col.module_name,
            proj.name AS project_name, col.deleted_at,
            (SELECT COUNT(*) FROM yapiez_apis a
              WHERE a.collection_id = col.id AND a.tenant_id = col.tenant_id
                AND a.deleted_at IS NULL)::int AS item_count
       FROM yapiez_collections col
       LEFT JOIN projects proj ON proj.id = col.project_id
      WHERE col.tenant_id = $1 AND col.deleted_at IS NOT NULL${colProject}
      ORDER BY col.deleted_at DESC
      LIMIT 200`,
    colParams
  );

  const entries: TrashEntry[] = [
    ...apiRows.map((row: any) => ({
      kind: 'api' as const,
      id: row.id,
      name: row.name,
      method: row.method ?? null,
      url: row.url ?? null,
      description: row.description ?? null,
      moduleName: row.module_name ?? null,
      collectionName: row.collection_name ?? null,
      projectName: row.project_name ?? null,
      itemCount: 0,
      deletedAt: row.deleted_at,
    })),
    ...colRows.map((row: any) => ({
      kind: 'collection' as const,
      id: row.id,
      name: row.name,
      method: null,
      url: null,
      description: row.description ?? null,
      moduleName: row.module_name ?? null,
      collectionName: null,
      projectName: row.project_name ?? null,
      itemCount: Number(row.item_count ?? 0),
      deletedAt: row.deleted_at,
    })),
  ];

  return entries.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
}

const TRASH_TABLE = { api: 'yapiez_apis', collection: 'yapiez_collections' } as const;

/** Put one thing back. */
export async function restoreFromTrash(
  c: TenantClient,
  kind: 'api' | 'collection',
  id: string
): Promise<void> {
  const { rowCount } = await c.query(
    `UPDATE ${TRASH_TABLE[kind]}
        SET deleted_at = NULL, deleted_by = NULL
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL`,
    [id, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound(kind === 'api' ? 'API' : 'Collection');
}

/**
 * Delete one thing for good.
 *
 * This is where the usage check lives. A soft delete is reversible so it can
 * afford to be permissive; this cannot be undone, so a definition another
 * record still points at is refused here rather than silently breaking it.
 */
export async function purgeFromTrash(
  c: TenantClient,
  kind: 'api' | 'collection',
  id: string
): Promise<void> {
  if (kind === 'api') {
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
        `This API is still referenced by ${names}. Restore it, or remove those references first — deleting it for good would break them.`
      );
    }
  }

  const { rowCount } = await c.query(
    `DELETE FROM ${TRASH_TABLE[kind]} WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NOT NULL`,
    [id, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound(kind === 'api' ? 'API' : 'Collection');
}

/**
 * Empty the trash for one project.
 *
 * Definitions go first: a collection cannot be removed while a trashed
 * definition still points at it, and doing it in the other order would leave
 * the collection behind with nothing explaining why.
 */
export async function emptyTrash(
  c: TenantClient,
  filters: { projectId?: string } = {}
): Promise<{ apis: number; collections: number }> {
  const run = async (table: 'yapiez_apis' | 'yapiez_collections') => {
    const params: any[] = [c.tenantId];
    const where = [`tenant_id = $1`, `deleted_at IS NOT NULL`];
    if (filters.projectId) where.push(projectClause('project_id', filters.projectId, params));
    const { rowCount } = await c.query(
      `DELETE FROM ${table} WHERE ${where.join(' AND ')}`,
      params
    );
    return rowCount ?? 0;
  };

  const apis = await run('yapiez_apis');
  const collections = await run('yapiez_collections');
  return { apis, collections };
}

/** Catalog counters for the Yapiez landing header. */
export async function apiStats(c: TenantClient): Promise<Record<string, number>> {
  const { rows } = await c.query(
    `SELECT
       (SELECT COUNT(*) FROM yapiez_apis
         WHERE tenant_id = $1 AND is_deprecated = FALSE AND deleted_at IS NULL)::int AS apis,
       (SELECT COUNT(*) FROM yapiez_collections
         WHERE tenant_id = $1 AND deleted_at IS NULL)::int AS collections,
       (SELECT COUNT(*) FROM yapiez_sources WHERE tenant_id = $1)::int AS sources,
       (SELECT COUNT(*) FROM yapiez_flows WHERE tenant_id = $1 AND status <> 'Archived')::int AS flows,
       (SELECT COUNT(*) FROM yapiez_environments WHERE tenant_id = $1)::int AS environments,
       (SELECT COUNT(*) FROM yapiez_flow_runs WHERE tenant_id = $1)::int AS runs,
       (SELECT COUNT(*) FROM yapiez_flow_runs WHERE tenant_id = $1 AND status = 'Failed')::int AS failed_runs`,
    [c.tenantId]
  );
  return rows[0] ?? {};
}
