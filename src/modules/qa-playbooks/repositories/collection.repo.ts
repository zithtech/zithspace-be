// src/modules/qa-playbooks/repositories/collection.repo.ts
//
// Collections — curated, ordered bundles of playbooks. See migration 005 for
// why this is a second axis rather than a column on qa_playbooks.
//
// THE ONE RULE THAT MATTERS HERE, and the reason membership is never read with
// a plain join: a collection lists playbooks, and a playbook may be one this
// viewer is not entitled to see AT ALL. Every membership read therefore
// re-applies the playbook visibility rule from playbook.repo.ts. Without that,
// a public collection would leak the existence — name, slug, summary — of
// another workspace's private playbook to everyone who opened it.
//
// A premium playbook inside a collection is a different case and is NOT hidden:
// it comes back listed with `locked: true`, exactly as the catalog returns it,
// because you cannot decide to buy what you cannot see.

import { TenantClient } from '../db/pool';
import { slugify, type CollectionKind, type PlaybookVisibility } from '../constants';

export interface CollectionSummary {
  id: string;
  slug: string;
  name: string;
  kind: CollectionKind;
  /** Who the pack is for. Free text, chosen from a list the UI offers. */
  industry: string | null;
  summary: string | null;
  icon: string | null;
  visibility: PlaybookVisibility;
  status: string;
  isOwn: boolean;
  priceCredits: number | null;
  priceAmount: string | null;
  priceCurrency: string;
  sortOrder: number;
  /** Premium pack this tenant has not bought. The pack still LISTS — see 007. */
  locked: boolean;
  /** This workspace said "we build this". Reorders the shelf, never gates it. */
  pinned: boolean;
  /** Playbooks in the collection THIS viewer can see — not the raw row count. */
  playbookCount: number;
  /** Recommendations across those playbooks, so a pack advertises its weight. */
  itemCount: number;
  updatedAt: string;
}

export interface CollectionMember {
  id: string;
  slug: string;
  name: string;
  category: string;
  summary: string | null;
  visibility: PlaybookVisibility;
  status: string;
  isOwn: boolean;
  locked: boolean;
  itemCount: number;
  /** Position in the collection's reading order. */
  sortOrder: number;
  /** Why this playbook earns its place in THIS pack. */
  note: string | null;
}

export interface CollectionDetail extends CollectionSummary {
  description: string | null;
  playbooks: CollectionMember[];
  /** The viewer has asked for this pack and nobody has decided yet. */
  pendingRequest: boolean;
}

/**
 * Collections this tenant may see.
 * - Draft: visible ONLY to its creator ($2 = created_by) - even super_admin cannot see other creators' drafts
 * - Published: visible if public/premium OR belonging to this workspace ($1 = tenant_id), with super_admin ($3 = true) seeing published rows
 * - Soft delete: deleted_at IS NULL
 */
const SCOPE = `(
  (c.status = 'draft' AND c.created_by IS NOT NULL AND c.created_by = $2)
  OR (c.status = 'published' AND (
    c.visibility IN ('public', 'premium')
    OR (c.visibility = 'workspace' AND ((c.tenant_id IS NOT NULL AND c.tenant_id = $1) OR (c.tenant_id IS NULL AND c.created_by = $2)))
  ))
) AND ($3::boolean IS NOT NULL) AND c.deleted_at IS NULL`;

/** The playbook visibility rule, re-applied to membership. */
const PLAYBOOK_SCOPE = `(
  (p.status = 'draft' AND p.created_by IS NOT NULL AND p.created_by = $2)
  OR (p.status = 'published' AND (
    p.visibility IN ('public', 'premium')
    OR (p.visibility = 'workspace' AND ((p.tenant_id IS NOT NULL AND p.tenant_id = $1) OR (p.tenant_id IS NULL AND p.created_by = $2)))
  ))
) AND ($3::boolean IS NOT NULL) AND p.deleted_at IS NULL AND p.category_deleted_at IS NULL`;

/**
 * The playbook unlock rule, kept identical to UNLOCKED in playbook.repo.ts.
 *
 * It has to be: a playbook shown inside a collection and the same playbook shown
 * in the catalog must not disagree about whether it is locked. Both arms are
 * here — a direct unlock, or an unlock on any collection containing it.
 */
const PLAYBOOK_UNLOCKED = `(
  p.visibility <> 'premium'
  OR EXISTS (
    SELECT 1 FROM qa_playbook_unlocks u
     WHERE u.playbook_id = p.id AND u.tenant_id = $1
       AND (u.expires_at IS NULL OR u.expires_at > NOW())
  )
  OR EXISTS (
    SELECT 1
      FROM qa_playbook_collection_items ci2
      JOIN qa_playbook_collection_unlocks cu ON cu.collection_id = ci2.collection_id
     WHERE ci2.playbook_id = p.id AND cu.tenant_id = $1
       AND (cu.expires_at IS NULL OR cu.expires_at > NOW())
  )
)`;

/** Has this tenant bought THIS pack? Only meaningful for a premium collection. */
const COLLECTION_UNLOCKED = `(
  c.visibility <> 'premium'
  OR EXISTS (
    SELECT 1 FROM qa_playbook_collection_unlocks cu
     WHERE cu.collection_id = c.id AND cu.tenant_id = $1
       AND (cu.expires_at IS NULL OR cu.expires_at > NOW())
  )
)`;

function mapSummary(r: any): CollectionSummary {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    industry: r.industry,
    summary: r.summary,
    icon: r.icon,
    visibility: r.visibility,
    status: r.status,
    isOwn: r.is_own,
    priceCredits: r.price_credits,
    priceAmount: r.price_amount,
    priceCurrency: r.price_currency,
    sortOrder: r.sort_order,
    locked: r.locked ?? false,
    pinned: r.pinned ?? false,
    playbookCount: r.playbook_count ?? 0,
    itemCount: r.item_count ?? 0,
    updatedAt: r.updated_at,
  };
}

export async function listCollections(
  client: TenantClient,
  filters: { kind?: string; search?: string; includeAll?: boolean; userId?: string; isSuperAdmin?: boolean } = {}
): Promise<CollectionSummary[]> {
  const isSuper = Boolean(filters.isSuperAdmin || filters.includeAll);
  const params: any[] = [client.tenantId, filters.userId || null, isSuper];
  let where = `WHERE ${SCOPE}`;

  if (filters.kind) {
    params.push(filters.kind);
    where += ` AND c.kind = $${params.length}`;
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where += ` AND (c.name ILIKE $${params.length} OR c.summary ILIKE $${params.length})`;
  }

  const { rows } = await client.query(
    `SELECT c.id, c.slug, c.name, c.kind, c.industry, c.summary, c.icon, c.visibility, c.status,
            c.price_credits, c.price_amount, c.price_currency, c.sort_order, c.updated_at,
            (c.created_by IS NOT NULL AND c.created_by = $2) AS is_own,
            NOT ${COLLECTION_UNLOCKED} AS locked,
            pin.sort_order IS NOT NULL AS pinned,
            COALESCE(stats.playbook_count, 0) AS playbook_count,
            COALESCE(stats.item_count, 0)     AS item_count
       FROM qa_playbook_collections c
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS playbook_count,
                COALESCE(SUM(pi.item_count), 0)::int AS item_count
           FROM qa_playbook_collection_items ci
           JOIN qa_playbooks p ON p.id = ci.playbook_id AND ${PLAYBOOK_SCOPE}
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS item_count
               FROM qa_playbook_items i WHERE i.playbook_id = p.id
           ) pi ON TRUE
          WHERE ci.collection_id = c.id
       ) stats ON TRUE
       LEFT JOIN qa_playbook_collection_pins pin
              ON pin.collection_id = c.id AND pin.tenant_id = $1
       ${where}
       ORDER BY (pin.sort_order IS NULL), pin.sort_order ASC,
                c.sort_order ASC, c.name ASC`,
    params
  );

  return rows.map(mapSummary);
}

/** One collection with its ordered, visibility-filtered membership. */
export async function getCollectionBySlug(
  client: TenantClient,
  slug: string,
  opts: { includeAll?: boolean; userId?: string; isSuperAdmin?: boolean } = {}
): Promise<CollectionDetail | null> {
  const isSuper = Boolean(opts.isSuperAdmin || opts.includeAll);
  const { rows } = await client.query(
    `SELECT c.id, c.slug, c.name, c.kind, c.industry, c.summary, c.description, c.icon,
            c.visibility, c.status, c.price_credits, c.price_amount, c.price_currency,
            c.sort_order, c.updated_at,
            (c.created_by IS NOT NULL AND c.created_by = $2) AS is_own,
            NOT ${COLLECTION_UNLOCKED} AS locked,
            EXISTS (
              SELECT 1 FROM qa_playbook_collection_pins pin
               WHERE pin.collection_id = c.id AND pin.tenant_id = $1
            ) AS pinned,
            EXISTS (
              SELECT 1 FROM qa_playbook_collection_unlock_requests r
               WHERE r.collection_id = c.id AND r.tenant_id = $1 AND r.status = 'pending'
            ) AS pending_request
       FROM qa_playbook_collections c
      WHERE c.slug = $4 AND ${SCOPE}
      LIMIT 1`,
    [client.tenantId, opts.userId || null, isSuper, slug]
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  const playbooks = await listMembers(client, row.id, opts);

  return {
    ...mapSummary({
      ...row,
      playbook_count: playbooks.length,
      item_count: playbooks.reduce((sum, p) => sum + p.itemCount, 0),
    }),
    description: row.description,
    playbooks,
    pendingRequest: row.pending_request,
  };
}

/**
 * The ordered membership of one collection, as this viewer may see it.
 */
export async function listMembers(
  client: TenantClient,
  collectionId: string,
  opts: { includeAll?: boolean; userId?: string; isSuperAdmin?: boolean } = {}
): Promise<CollectionMember[]> {
  const isSuper = Boolean(opts.isSuperAdmin || opts.includeAll);

  const { rows } = await client.query(
    `SELECT p.id, p.slug, p.name, p.category, p.summary, p.visibility, p.status,
            (p.created_by IS NOT NULL AND p.created_by = $2) AS is_own,
            NOT ${PLAYBOOK_UNLOCKED} AS locked,
            ci.sort_order, ci.note,
            COALESCE(stats.item_count, 0) AS item_count
       FROM qa_playbook_collection_items ci
       JOIN qa_playbooks p ON p.id = ci.playbook_id AND ${PLAYBOOK_SCOPE}
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS item_count
           FROM qa_playbook_items i WHERE i.playbook_id = p.id
       ) stats ON TRUE
      WHERE ci.collection_id = $4
      ORDER BY ci.sort_order ASC, p.name ASC`,
    [client.tenantId, opts.userId || null, isSuper, collectionId]
  );

  return rows.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    summary: r.summary,
    visibility: r.visibility,
    status: r.status,
    isOwn: r.is_own,
    locked: r.locked,
    itemCount: r.item_count,
    sortOrder: r.sort_order,
    note: r.note,
  }));
}

/**
 * Which collections each of these playbooks belongs to.
 *
 * Feeds the chips on a catalog card. Only collections the viewer may see, so a
 * card never advertises a pack that 404s when clicked.
 */
export async function collectionsForPlaybooks(
  client: TenantClient,
  playbookIds: string[],
  opts: { includeAll?: boolean; userId?: string; isSuperAdmin?: boolean } = {}
): Promise<Map<string, { slug: string; name: string; kind: string }[]>> {
  const map = new Map<string, { slug: string; name: string; kind: string }[]>();
  if (playbookIds.length === 0) return map;

  const isSuper = Boolean(opts.isSuperAdmin || opts.includeAll);
  const { rows } = await client.query(
    `SELECT ci.playbook_id, c.slug, c.name, c.kind
       FROM qa_playbook_collection_items ci
       JOIN qa_playbooks p ON p.id = ci.playbook_id
       JOIN qa_playbook_collections c ON c.id = ci.collection_id
      WHERE ci.playbook_id = ANY($4::uuid[])
        AND ${SCOPE}
      ORDER BY c.sort_order ASC, c.name ASC`,
    [client.tenantId, opts.userId || null, isSuper, playbookIds]
  );

  for (const r of rows as any[]) {
    const list = map.get(r.playbook_id) ?? [];
    list.push({ slug: r.slug, name: r.name, kind: r.kind });
    map.set(r.playbook_id, list);
  }
  return map;
}

/* ── Writing ─────────────────────────────────────────────────────────────── */

/** Slugs are the shared identity of a collection, so they are derived. */
async function uniqueSlug(
  client: TenantClient,
  ownerTenantId: string | null,
  name: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(name) || 'collection';
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const { rows } = await client.query(
      `SELECT 1 FROM qa_playbook_collections
        WHERE slug = $1
          AND tenant_id IS NOT DISTINCT FROM $2::uuid
          AND ($3::uuid IS NULL OR id <> $3::uuid)
        LIMIT 1`,
      [candidate, ownerTenantId, excludeId ?? null]
    );
    if (rows.length === 0) return candidate;
  }
  throw new Error('Could not derive a unique collection slug');
}

export interface CollectionMetaInput {
  name: string;
  kind: CollectionKind;
  industry: string | null;
  summary: string | null;
  description: string | null;
  icon: string | null;
  visibility: PlaybookVisibility;
  status?: string;
  priceCredits: number | null;
  priceAmount: number | null;
  priceCurrency: string;
  sortOrder: number;
}

export async function createCollection(
  client: TenantClient,
  input: CollectionMetaInput & { ownerTenantId: string | null; createdBy: string | null }
): Promise<{ id: string; slug: string }> {
  const slug = await uniqueSlug(client, input.ownerTenantId, input.name);
  const status = input.status ?? 'draft';
  const { rows } = await client.query(
    `INSERT INTO qa_playbook_collections
       (tenant_id, slug, name, kind, industry, summary, description, icon, visibility, status,
        price_credits, price_amount, price_currency, sort_order, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
     RETURNING id, slug`,
    [
      input.ownerTenantId,
      slug,
      input.name,
      input.kind,
      input.industry,
      input.summary,
      input.description,
      input.icon,
      input.visibility,
      status,
      input.priceCredits,
      input.priceAmount,
      input.priceCurrency,
      input.sortOrder,
      input.createdBy,
    ]
  );
  return rows[0];
}

export async function updateCollection(
  client: TenantClient,
  collectionId: string,
  input: CollectionMetaInput & { updatedBy: string | null }
): Promise<{ id: string; slug: string } | null> {
  const { rows: current } = await client.query(
    `SELECT tenant_id, name FROM qa_playbook_collections WHERE id = $1`,
    [collectionId]
  );
  if (current.length === 0) return null;

  // The slug follows the name only while the name is changing — an unrelated
  // edit must not break a link someone has already shared.
  const slug =
    current[0].name === input.name
      ? null
      : await uniqueSlug(client, current[0].tenant_id, input.name, collectionId);

  const { rows } = await client.query(
    `UPDATE qa_playbook_collections
        SET name = $2, kind = $3, industry = $4, summary = $5, description = $6, icon = $7,
            visibility = $8, price_credits = $9, price_amount = $10, price_currency = $11,
            sort_order = $12, status = COALESCE($13, status), slug = COALESCE($14, slug),
            updated_by = $15, updated_at = NOW()
      WHERE id = $1
      RETURNING id, slug`,
    [
      collectionId,
      input.name,
      input.kind,
      input.industry,
      input.summary,
      input.description,
      input.icon,
      input.visibility,
      input.priceCredits,
      input.priceAmount,
      input.priceCurrency,
      input.sortOrder,
      input.status ?? null,
      slug,
      input.updatedBy,
    ]
  );
  return rows[0] ?? null;
}

export async function setCollectionStatus(
  client: TenantClient,
  collectionId: string,
  status: string,
  updatedBy: string | null,
  visibility?: string | null
): Promise<void> {
  if (visibility) {
    await client.query(
      `UPDATE qa_playbook_collections
          SET status = $2, visibility = $3, updated_by = $4, updated_at = NOW()
        WHERE id = $1`,
      [collectionId, status, visibility, updatedBy]
    );
  } else {
    await client.query(
      `UPDATE qa_playbook_collections
          SET status = $2, updated_by = $3, updated_at = NOW()
        WHERE id = $1`,
      [collectionId, status, updatedBy]
    );
  }
}

export async function softDeleteCollection(
  client: TenantClient,
  collectionId: string,
  userId: string | null,
  isSuperAdmin = false
): Promise<{ id: string; name: string }> {
  const { rows: current } = await client.query(
    `SELECT id, name, tenant_id FROM qa_playbook_collections WHERE id = $1`,
    [collectionId]
  );
  if (current.length === 0) throw new Error('Collection not found');
  if (current[0].tenant_id === null && !isSuperAdmin) {
    const err: any = new Error('Global library collections cannot be deleted');
    err.status = 403;
    throw err;
  }
  const { rows } = await client.query(
    `UPDATE qa_playbook_collections
        SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
      WHERE id = $1 AND (tenant_id = $3 OR $4::boolean OR (tenant_id IS NULL AND $3::uuid IS NULL))
      RETURNING id, name`,
    [collectionId, userId, client.tenantId, isSuperAdmin]
  );
  return rows[0];
}

export async function restoreCollection(
  client: TenantClient,
  collectionId: string,
  isSuperAdmin = false
): Promise<{ id: string; name: string }> {
  const { rows } = await client.query(
    `UPDATE qa_playbook_collections
        SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
      WHERE id = $1 AND (tenant_id = $2 OR $3::boolean OR (tenant_id IS NULL AND $2::uuid IS NULL))
      RETURNING id, name`,
    [collectionId, client.tenantId, isSuperAdmin]
  );
  if (rows.length === 0) throw new Error('Collection not found in trash');
  return rows[0];
}

export async function permanentDeleteCollection(
  client: TenantClient,
  collectionId: string,
  isSuperAdmin = false
): Promise<void> {
  const { rows: current } = await client.query(
    `SELECT tenant_id FROM qa_playbook_collections WHERE id = $1`,
    [collectionId]
  );
  if (current.length === 0) return;
  if (current[0].tenant_id === null && !isSuperAdmin) {
    const err: any = new Error('Global library collections cannot be permanently deleted');
    err.status = 403;
    throw err;
  }
  await client.query(`DELETE FROM qa_playbook_collection_items WHERE collection_id = $1`, [collectionId]);
  await client.query(`DELETE FROM qa_playbook_collections WHERE id = $1 AND (tenant_id = $2 OR $3::boolean OR (tenant_id IS NULL AND $2::uuid IS NULL))`, [
    collectionId,
    client.tenantId,
    isSuperAdmin,
  ]);
}

export async function listTrashCollections(
  client: TenantClient,
  isSuperAdmin = false
): Promise<any[]> {
  const { rows } = await client.query(
    `SELECT c.id, c.slug, c.name, c.kind, c.summary, c.icon, c.deleted_at, c.deleted_by,
            COUNT(ci.playbook_id)::int AS playbook_count,
            COALESCE(u.name, u.work_email, 'User') AS deleted_by_name
       FROM qa_playbook_collections c
       LEFT JOIN users u ON u.id::text = c.deleted_by::text
       LEFT JOIN qa_playbook_collection_items ci ON ci.collection_id = c.id
      WHERE (c.tenant_id = $1 OR c.tenant_id IS NULL OR $2::boolean) AND c.deleted_at IS NOT NULL
      GROUP BY c.id, c.slug, c.name, c.kind, c.summary, c.icon, c.deleted_at, c.deleted_by, u.name, u.work_email
      ORDER BY c.deleted_at DESC`,
    [client.tenantId, isSuperAdmin]
  );
  return rows;
}

export async function getCollectionOwnership(
  client: TenantClient,
  collectionId: string
): Promise<{ id: string; slug: string; name: string; tenantId: string | null; createdBy: string | null; status: string } | null> {
  const { rows } = await client.query(
    `SELECT id, slug, name, tenant_id, created_by, status FROM qa_playbook_collections WHERE id = $1`,
    [collectionId]
  );
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    slug: rows[0].slug,
    name: rows[0].name,
    tenantId: rows[0].tenant_id,
    createdBy: rows[0].created_by,
    status: rows[0].status,
  };
}

/**
 * Which of these playbook ids may legitimately go into a collection owned by
 * `ownerTenantId`, returned in the order asked for.
 *
 * THE RULE, and why it is here rather than a CHECK constraint: a library
 * collection (tenant_id NULL) is read by every tenant, so it may only contain
 * library playbooks — putting one workspace's private playbook in it would
 * publish that workspace's work to the platform. A workspace collection may
 * hold library playbooks and its own. Postgres cannot express that in a CHECK
 * without a trigger reaching across tables, so it is enforced on the way in and
 * the caller is told exactly which ids were refused rather than silently losing
 * them.
 */
export async function filterAssignablePlaybooks(
  client: TenantClient,
  ownerTenantId: string | null,
  playbookIds: string[]
): Promise<string[]> {
  if (playbookIds.length === 0) return [];

  // One predicate for both cases: $1 is the OWNER, which is NULL for a library
  // collection — and `p.tenant_id = NULL` is never true, so a library
  // collection is left with library playbooks and nothing else.
  const { rows } = await client.query(
    `SELECT p.id FROM qa_playbooks p
      WHERE p.id = ANY($2::uuid[])
        AND (p.tenant_id IS NULL OR p.tenant_id = $1::uuid)`,
    [ownerTenantId, playbookIds]
  );

  const allowed = new Set(rows.map((r: any) => r.id));
  return playbookIds.filter((id) => allowed.has(id));
}

/**
 * Replace a collection's membership wholesale, in the order given.
 *
 * WHOLE-DOCUMENT, like replaceContent on a playbook: the curation UI hands back
 * the list it is showing, and `sort_order` is the array index. Add/remove/move
 * endpoints would have made every drag a request and left the client and server
 * arguing about order after a failed one.
 */
export async function replaceMembers(
  client: TenantClient,
  collectionId: string,
  members: { playbookId: string; note?: string | null }[],
  addedBy: string | null
): Promise<{ playbookCount: number }> {
  await client.query(`DELETE FROM qa_playbook_collection_items WHERE collection_id = $1`, [
    collectionId,
  ]);

  if (members.length > 0) {
    const values: string[] = [];
    const params: any[] = [collectionId, addedBy];
    members.forEach((m, index) => {
      params.push(m.playbookId, index, m.note ?? null);
      const base = params.length - 3;
      values.push(`($1, $${base + 1}::uuid, $${base + 2}::int, $${base + 3}, $2)`);
    });

    await client.query(
      `INSERT INTO qa_playbook_collection_items
         (collection_id, playbook_id, sort_order, note, added_by)
       VALUES ${values.join(', ')}`,
      params
    );
  }

  await client.query(
    `UPDATE qa_playbook_collections SET updated_at = NOW(), updated_by = $2 WHERE id = $1`,
    [collectionId, addedBy]
  );

  return { playbookCount: members.length };
}

/* ── Pins: "what do you build?", remembered ──────────────────────────────── */

/**
 * Replace this workspace's pinned collections, in the order given.
 *
 * Whole-set, like membership: the picker hands back the list it is showing, and
 * position is the array index. A pin is only ever a workspace's note about
 * itself, so there is no ownership question here beyond the tenant scope every
 * query in this file already carries.
 *
 * Ids that are not collections this tenant may see are dropped rather than
 * stored — a pin pointing at something invisible would sort the shelf by a row
 * the viewer can never reach.
 */
export async function replacePins(
  client: TenantClient,
  collectionIds: string[],
  pinnedBy: string | null
): Promise<{ pinned: number }> {
  await client.query(`DELETE FROM qa_playbook_collection_pins WHERE tenant_id = $1`, [
    client.tenantId,
  ]);

  if (collectionIds.length === 0) return { pinned: 0 };

  const { rows: visible } = await client.query(
    `SELECT c.id FROM qa_playbook_collections c
      WHERE c.id = ANY($4::uuid[]) AND ${SCOPE}`,
    [client.tenantId, pinnedBy || null, false, collectionIds]
  );
  const allowed = new Set(visible.map((r: any) => r.id));
  const ordered = collectionIds.filter((id) => allowed.has(id));
  if (ordered.length === 0) return { pinned: 0 };

  const values: string[] = [];
  const params: any[] = [client.tenantId, pinnedBy];
  ordered.forEach((id, index) => {
    params.push(id, index);
    const base = params.length - 2;
    values.push(`($1, $${base + 1}::uuid, $${base + 2}::int, $2)`);
  });

  await client.query(
    `INSERT INTO qa_playbook_collection_pins (tenant_id, collection_id, sort_order, pinned_by)
     VALUES ${values.join(', ')}`,
    params
  );

  return { pinned: ordered.length };
}

/** Has this workspace answered "what do you build?" at all yet? */
export async function countPins(client: TenantClient): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM qa_playbook_collection_pins WHERE tenant_id = $1`,
    [client.tenantId]
  );
  return rows[0]?.n ?? 0;
}

/* ── Unlocks: a pack as something you can buy ────────────────────────────── */

/**
 * Ask for access to a premium pack.
 *
 * Idempotent by design: the partial unique index in migration 007 allows one
 * PENDING row per tenant per collection, so a second ask returns the first
 * rather than queuing a duplicate decision for an admin.
 */
export async function createCollectionUnlockRequest(
  client: TenantClient,
  collectionId: string,
  requestedBy: string | null,
  message: string | null
): Promise<{ id: string; status: string; created: boolean }> {
  const { rows: existing } = await client.query(
    `SELECT id, status FROM qa_playbook_collection_unlock_requests
      WHERE collection_id = $1 AND tenant_id = $2 AND status = 'pending'
      LIMIT 1`,
    [collectionId, client.tenantId]
  );
  if (existing.length > 0) {
    return { id: existing[0].id, status: existing[0].status, created: false };
  }

  const { rows } = await client.query(
    `INSERT INTO qa_playbook_collection_unlock_requests
       (collection_id, tenant_id, requested_by, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id, status`,
    [collectionId, client.tenantId, requestedBy, message]
  );
  return { id: rows[0].id, status: rows[0].status, created: true };
}

export interface CollectionUnlockRequestRow {
  id: string;
  collectionId: string;
  collectionName: string;
  collectionSlug: string;
  tenantId: string;
  tenantName: string | null;
  tenantSubdomain: string | null;
  requestedBy: string | null;
  requestedByName: string | null;
  message: string | null;
  status: string;
  priceCredits: number | null;
  priceAmount: string | null;
  priceCurrency: string;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/**
 * Every workspace's ask, for Testiez to work through.
 *
 * NOT tenant-scoped, and that is the point — this is the platform queue. The
 * route is super_admin-only, which is what keeps it that way.
 */
export async function listCollectionUnlockRequests(
  client: TenantClient,
  status?: string
): Promise<CollectionUnlockRequestRow[]> {
  const params: any[] = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE r.status = $${params.length}`;
  }

  const { rows } = await client.query(
    `SELECT r.id, r.collection_id, r.tenant_id, r.requested_by, r.message, r.status,
            r.decision_note, r.created_at, r.decided_at,
            c.name AS collection_name, c.slug AS collection_slug,
            c.price_credits, c.price_amount, c.price_currency,
            t.name AS tenant_name, t.subdomain AS tenant_subdomain,
            u.name AS requested_by_name
       FROM qa_playbook_collection_unlock_requests r
       JOIN qa_playbook_collections c ON c.id = r.collection_id
       -- tenants.id and users.id are TEXT in this database while these columns
       -- are uuid, so both joins cast — the same cast listUnlockRequests needs.
       LEFT JOIN tenants t ON t.id::text = r.tenant_id::text
       LEFT JOIN users u ON u.id::text = r.requested_by::text
       ${where}
       ORDER BY r.created_at DESC
       LIMIT 200`,
    params
  );

  return rows.map((r: any) => ({
    id: r.id,
    collectionId: r.collection_id,
    collectionName: r.collection_name,
    collectionSlug: r.collection_slug,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    tenantSubdomain: r.tenant_subdomain,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    message: r.message,
    status: r.status,
    priceCredits: r.price_credits,
    priceAmount: r.price_amount,
    priceCurrency: r.price_currency,
    decisionNote: r.decision_note,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }));
}

/**
 * Approve or decline one ask.
 *
 * Approving writes the unlock as well as the decision, in the caller's
 * transaction — a decision recorded without the access it promises is the one
 * failure mode that would look fine in the admin and be broken for the customer.
 */
export async function decideCollectionUnlockRequest(
  client: TenantClient,
  requestId: string,
  decision: 'approved' | 'declined',
  decidedBy: string | null,
  note: string | null
): Promise<{ id: string; status: string } | null> {
  const { rows } = await client.query(
    `UPDATE qa_playbook_collection_unlock_requests
        SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = $4
      WHERE id = $1 AND status = 'pending'
      RETURNING id, status, collection_id, tenant_id`,
    [requestId, decision, decidedBy, note]
  );
  if (rows.length === 0) return null;

  if (decision === 'approved') {
    await grantCollection(client, rows[0].collection_id, rows[0].tenant_id, {
      origin: 'admin_grant',
      grantedBy: decidedBy,
      note,
    });
  }

  return { id: rows[0].id, status: rows[0].status };
}

/** Give a workspace a pack. Re-granting refreshes the row rather than failing. */
export async function grantCollection(
  client: TenantClient,
  collectionId: string,
  tenantId: string,
  opts: {
    origin?: string;
    grantedBy?: string | null;
    note?: string | null;
    expiresAt?: string | null;
  } = {}
): Promise<void> {
  await client.query(
    `INSERT INTO qa_playbook_collection_unlocks
       (collection_id, tenant_id, origin, granted_by, note, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (collection_id, tenant_id) DO UPDATE
        SET origin     = EXCLUDED.origin,
            granted_by = EXCLUDED.granted_by,
            note       = EXCLUDED.note,
            expires_at = EXCLUDED.expires_at,
            granted_at = NOW()`,
    [
      collectionId,
      tenantId,
      opts.origin ?? 'admin_grant',
      opts.grantedBy ?? null,
      opts.note ?? null,
      opts.expiresAt ?? null,
    ]
  );
}

/**
 * Industries anyone on this platform has already named.
 *
 * The picker offers a curated starting list plus whatever has actually been
 * used, so the second person to build a fintech pack is offered the same label
 * the first one typed rather than inventing "FinTech" beside "Fintech".
 *
 * Scoped like every other read here: a workspace never learns the vocabulary of
 * another workspace's private collections.
 */
export async function listIndustries(
  client: TenantClient,
  opts: { includeAll?: boolean; userId?: string; isSuperAdmin?: boolean } = {}
): Promise<string[]> {
  const isSuper = Boolean(opts.isSuperAdmin || opts.includeAll);
  const { rows } = await client.query(
    `SELECT DISTINCT c.industry
       FROM qa_playbook_collections c
      WHERE c.industry IS NOT NULL AND c.industry <> ''
        AND ${SCOPE}
      ORDER BY c.industry ASC`,
    [client.tenantId, opts.userId || null, isSuper]
  );
  return rows.map((r: any) => r.industry);
}

/**
 * Append ONE playbook to a collection, at the end of its reading order.
 *
 * Deliberately separate from replaceMembers, which rewrites the whole list.
 * "File this new playbook in that pack" and "curate this pack" are different
 * acts: the first must not be able to disturb an order somebody worked on, and
 * a client that had to read the membership, append, and write it all back would
 * silently drop a concurrent edit between the read and the write.
 *
 * Idempotent — adding a playbook already in the pack leaves it where it is
 * rather than moving it to the end.
 */
export async function addMember(
  client: TenantClient,
  collectionId: string,
  playbookId: string,
  addedBy: string | null
): Promise<{ added: boolean }> {
  const { rows } = await client.query(
    `INSERT INTO qa_playbook_collection_items (collection_id, playbook_id, sort_order, added_by)
     SELECT $1, $2, COALESCE(MAX(sort_order) + 1, 0), $3
       FROM qa_playbook_collection_items WHERE collection_id = $1
     ON CONFLICT (collection_id, playbook_id) DO NOTHING
     RETURNING id`,
    [collectionId, playbookId, addedBy]
  );

  if (rows.length > 0) {
    await client.query(
      `UPDATE qa_playbook_collections SET updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [collectionId, addedBy]
    );
  }
  return { added: rows.length > 0 };
}
