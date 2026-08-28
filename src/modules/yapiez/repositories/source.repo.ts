// src/modules/yapiez/repositories/source.repo.ts
//
// Sources — the deployment tier sitting above collections in the catalog.
//
// A Source is a label, not a run target: it says which tier a set of
// definitions describes, while an Environment says where a flow actually goes.
// See db/migrations/002_yapiez_sources.sql for why the two stay separate.

import { TenantClient } from '../db/pool';
import { YapiezError } from '../types';
import { SourceDto, toSource } from './mappers';
import { SourceCreateInput, SourceUpdateInput } from '../validators';

/**
 * What a tenant gets before anyone configures anything.
 *
 * Seeded on first read rather than at tenant creation, matching how the Bug
 * List seeds its severities — existing tenants pick them up without a backfill.
 */
const DEFAULT_SOURCES: Array<{ key: string; label: string; description: string; color: string; sort: number; isDefault: boolean }> = [
  { key: 'local', label: 'Local', description: 'Developer machines', color: '#64748b', sort: 10, isDefault: false },
  { key: 'staging', label: 'Staging', description: 'Pre-release integration', color: '#3b82f6', sort: 20, isDefault: true },
  { key: 'beta', label: 'Beta', description: 'Early-access / UAT', color: '#8b5cf6', sort: 30, isDefault: false },
  { key: 'prod', label: 'Prod', description: 'Live production', color: '#10b981', sort: 40, isDefault: false },
];

/** `yapiez_sources` has unique indexes on both key and label, per tenant. */
function rethrowDuplicate(err: any): never {
  if (err?.code === '23505') {
    throw YapiezError.conflict('A source with that name already exists.');
  }
  throw err;
}

/**
 * Create the default tiers the first time a tenant looks at its sources.
 *
 * ON CONFLICT DO NOTHING rather than a count check, so two concurrent first
 * requests cannot race into a duplicate-key error.
 */
async function ensureDefaults(c: TenantClient): Promise<void> {
  const { rows } = await c.query(
    `SELECT 1 FROM yapiez_sources WHERE tenant_id = $1 LIMIT 1`,
    [c.tenantId]
  );
  if (rows.length) return;

  for (const source of DEFAULT_SOURCES) {
    await c.query(
      `INSERT INTO yapiez_sources (tenant_id, key, label, description, color, sort, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [c.tenantId, source.key, source.label, source.description, source.color, source.sort, source.isDefault]
    );
  }
}

/**
 * The tiers, with counts.
 *
 * The API count reads the definition's own `source_id`, falling back to the
 * collection it was filed under before modules replaced collections — a row
 * written either way is counted exactly once.
 *
 * `projectId` narrows the counts to one project — the catalog sidebar shows
 * them beside each tier, and a count that ignored the selected project would
 * be actively misleading. A NULL project means "shared", so those rows are
 * counted into every project.
 */
export async function listSources(
  c: TenantClient,
  filters: { projectId?: string } = {}
): Promise<SourceDto[]> {
  await ensureDefaults(c);

  const params: any[] = [c.tenantId];
  let collectionProject = '';
  let apiProject = '';
  if (filters.projectId) {
    params.push(filters.projectId);
    collectionProject = ` AND (col.project_id = $${params.length} OR col.project_id IS NULL)`;
    apiProject = ` AND (a.project_id = $${params.length} OR a.project_id IS NULL)`;
  }

  const { rows } = await c.query(
    `SELECT s.*,
            (SELECT COUNT(*) FROM yapiez_collections col
              WHERE col.source_id = s.id AND col.tenant_id = s.tenant_id
                AND col.deleted_at IS NULL${collectionProject}) AS collection_count,
            (SELECT COUNT(*) FROM yapiez_apis a
               LEFT JOIN yapiez_collections col ON col.id = a.collection_id AND col.deleted_at IS NULL
              WHERE COALESCE(a.source_id, col.source_id) = s.id
                AND a.tenant_id = s.tenant_id AND a.deleted_at IS NULL${apiProject}) AS api_count
       FROM yapiez_sources s
      WHERE s.tenant_id = $1
      ORDER BY s.sort ASC, s.label ASC`,
    params
  );
  return rows.map(toSource);
}

export async function getSource(c: TenantClient, id: string): Promise<SourceDto> {
  const { rows } = await c.query(
    `SELECT * FROM yapiez_sources WHERE id = $1 AND tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rows[0]) throw YapiezError.notFound('Source');
  return toSource(rows[0]);
}

/** The tier a new collection lands in when the author does not pick one. */
export async function getDefaultSource(c: TenantClient): Promise<SourceDto | null> {
  await ensureDefaults(c);
  const { rows } = await c.query(
    `SELECT * FROM yapiez_sources
      WHERE tenant_id = $1
      ORDER BY is_default DESC, sort ASC
      LIMIT 1`,
    [c.tenantId]
  );
  return rows[0] ? toSource(rows[0]) : null;
}

/** Only one source per tenant may carry the default flag. */
async function clearOtherDefaults(c: TenantClient, keepId: string): Promise<void> {
  await c.query(
    `UPDATE yapiez_sources SET is_default = FALSE WHERE tenant_id = $1 AND id <> $2`,
    [c.tenantId, keepId]
  );
}

/** Derive a machine key from a label the author typed. */
function keyFrom(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'source';
}

export async function createSource(
  c: TenantClient,
  userId: string,
  input: SourceCreateInput
): Promise<SourceDto> {
  await ensureDefaults(c);

  // New tiers go to the end unless the caller placed them.
  const sort =
    input.sort ??
    (
      await c.query(
        `SELECT COALESCE(MAX(sort), 0) + 10 AS next FROM yapiez_sources WHERE tenant_id = $1`,
        [c.tenantId]
      )
    ).rows[0].next;

  try {
    const { rows } = await c.query(
      `INSERT INTO yapiez_sources (tenant_id, key, label, description, color, sort, is_default, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING *`,
      [
        c.tenantId,
        input.key?.trim() || keyFrom(input.label),
        input.label.trim(),
        input.description ?? null,
        input.color ?? null,
        sort,
        input.isDefault ?? false,
        userId,
      ]
    );
    if (input.isDefault) await clearOtherDefaults(c, rows[0].id);
    return toSource(rows[0]);
  } catch (err) {
    rethrowDuplicate(err);
  }
}

export async function updateSource(
  c: TenantClient,
  userId: string,
  id: string,
  input: SourceUpdateInput
): Promise<SourceDto> {
  try {
    const { rows } = await c.query(
      `UPDATE yapiez_sources
          SET label       = COALESCE($3, label),
              description = COALESCE($4, description),
              color       = COALESCE($5, color),
              sort        = COALESCE($6, sort),
              is_default  = COALESCE($7, is_default),
              updated_by  = $8
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [
        id,
        c.tenantId,
        input.label ?? null,
        input.description ?? null,
        input.color ?? null,
        input.sort ?? null,
        input.isDefault ?? null,
        userId,
      ]
    );
    if (!rows[0]) throw YapiezError.notFound('Source');
    if (input.isDefault) await clearOtherDefaults(c, id);
    return toSource(rows[0]);
  } catch (err) {
    rethrowDuplicate(err);
  }
}

/**
 * Delete a source. Its collections survive and become unfiled (the FK is
 * ON DELETE SET NULL).
 *
 * Unlike deleting an API definition — which is refused while a flow uses it —
 * a source is only a label. Losing it cannot change what a flow executes, so
 * refusing would be obstruction rather than protection. The caller is told how
 * much it holds first so the confirmation can say so.
 */
export async function deleteSource(c: TenantClient, id: string): Promise<{ orphanedCollections: number }> {
  const { rows: counts } = await c.query(
    `SELECT COUNT(*)::int AS n FROM yapiez_collections
      WHERE source_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, c.tenantId]
  );

  const { rowCount } = await c.query(
    `DELETE FROM yapiez_sources WHERE id = $1 AND tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound('Source');

  return { orphanedCollections: counts[0]?.n ?? 0 };
}
