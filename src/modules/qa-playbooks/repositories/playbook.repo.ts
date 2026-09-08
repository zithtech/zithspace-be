// src/modules/qa-playbooks/repositories/playbook.repo.ts
//
// All playbook reads and writes. The database is the only source of playbook
// content — nothing seeds these tables from the repo.
//
// THE VISIBILITY RULE, in one place so it cannot drift between endpoints:
//
//   public     every tenant reads it, free
//   premium    every tenant SEES it; the BODY needs an unlock row
//   workspace  only the owning tenant sees it at all
//
// `SCOPE` below is that rule as SQL, and every read composes it. A premium
// playbook a tenant has not unlocked still comes back from the catalog and from
// getPlaybookBySlug — with `locked: true` and no items — because you cannot
// decide to buy what you cannot see.

import { TenantClient } from '../db/pool';
import { slugify, type PlaybookVisibility } from '../constants';

export interface PlaybookSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  summary: string | null;
  version: string;
  visibility: PlaybookVisibility;
  status: string;
  isOwn: boolean;
  locked: boolean;
  priceCredits: number | null;
  priceAmount: string | null;
  priceCurrency: string;
  lastUpdatedAt: string;
  itemCount: number;
  levelCounts: Record<string, number>;
  categories: string[];
}

export interface PlaybookItemRow {
  id: string;
  key: string;
  sectionId: string;
  title: string;
  whatToTest: string | null;
  examples: unknown[];
  expected: string | null;
  steps: string[];
  level: string;
  category: string;
  risk: string;
  whyItMatters: string | null;
  preconditions: string[];
  edgeCases: string[];
  references: {
    type: string;
    name: string;
    description?: string;
    url?: string | null;
  }[];
  appliesWhen: Record<string, string[]>;
  /** Only populated by getItemsByIds — generation records where an item came from. */
  sectionTitle?: string;
}

export interface PlaybookSectionRow {
  id: string;
  key: string;
  parentSectionId: string | null;
  title: string;
  description: string | null;
  /** Always present. Empty on a locked playbook — see `itemCount` for the size. */
  items: PlaybookItemRow[];
  itemCount: number;
  sections: PlaybookSectionRow[];
}

export interface PlaybookDetail extends Omit<PlaybookSummary, 'categories'> {
  overview: string | null;
  categories: string[];
  sections: PlaybookSectionRow[];
  versions: { version: string; changelog: string | null; itemCount: number; publishedAt: string }[];
  /** Set when the viewer has asked for access and no decision has been made. */
  pendingRequest: boolean;
}

/**
 * Rows this tenant may see at all. $1 is the tenant id.
 *
 * A draft is visible only to its owner — and platform drafts (tenant_id NULL)
 * are visible only to a super_admin, which callers add on top via `includeAll`.
 */
const SCOPE = `(
  (p.tenant_id IS NULL AND p.status = 'published' AND p.visibility IN ('public','premium'))
  OR p.tenant_id = $1
)`;

/**
 * What a super_admin curating the library sees: every library row whatever its
 * status or visibility, plus this workspace's own rows. Tenancy still holds —
 * another workspace's private playbooks are nobody's business, super_admin
 * included — so this is `SCOPE` minus the published/visibility gate, NOT an
 * unfiltered read.
 */
const CURATOR_SCOPE = `(p.tenant_id IS NULL OR p.tenant_id = $1)`;

/** Is the body readable, as opposed to merely listed? */
const UNLOCKED = `(
  p.visibility <> 'premium'
  OR EXISTS (
    SELECT 1 FROM qa_playbook_unlocks u
     WHERE u.playbook_id = p.id AND u.tenant_id = $1
       AND (u.expires_at IS NULL OR u.expires_at > NOW())
  )
)`;

export async function listPlaybooks(
  client: TenantClient,
  filters: { category?: string; search?: string; mine?: boolean; includeAll?: boolean }
): Promise<PlaybookSummary[]> {
  const params: any[] = [client.tenantId];
  // A super_admin curating the library needs to see drafts and archived rows
  // that no tenant should be offered.
  let where = `WHERE ${filters.includeAll ? CURATOR_SCOPE : SCOPE}`;

  if (filters.mine) where += ` AND p.tenant_id = $1`;
  if (filters.category) {
    params.push(filters.category);
    where += ` AND p.category = $${params.length}`;
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where += ` AND (p.name ILIKE $${params.length} OR p.summary ILIKE $${params.length} OR p.category ILIKE $${params.length})`;
  }

  const { rows } = await client.query(
    `SELECT p.id, p.slug, p.name, p.category, p.summary, p.version, p.visibility, p.status,
            p.price_credits, p.price_amount, p.price_currency, p.last_updated_at,
            p.tenant_id IS NOT NULL AS is_own,
            NOT ${UNLOCKED} AS locked,
            COALESCE(stats.item_count, 0)            AS item_count,
            COALESCE(stats.categories, '{}'::text[]) AS categories
       FROM qa_playbooks p
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int                 AS item_count,
                array_agg(DISTINCT i.category) AS categories
           FROM qa_playbook_items i
          WHERE i.playbook_id = p.id
       ) stats ON TRUE
       ${where}
       -- Your own playbooks first, then the maintained library.
       ORDER BY (p.tenant_id IS NOT NULL) DESC,
                (p.category = 'Authentication') DESC,
                p.category ASC, p.name ASC`,
    params
  );

  const ids = rows.map((r: any) => r.id);
  const levelMap = new Map<string, Record<string, number>>();
  if (ids.length > 0) {
    const { rows: levels } = await client.query(
      `SELECT playbook_id, level, COUNT(*)::int AS count
         FROM qa_playbook_items
        WHERE playbook_id = ANY($1::uuid[])
        GROUP BY playbook_id, level`,
      [ids]
    );
    for (const row of levels as any[]) {
      const entry = levelMap.get(row.playbook_id) ?? {};
      entry[row.level] = row.count;
      levelMap.set(row.playbook_id, entry);
    }
  }

  return rows.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    summary: r.summary,
    version: r.version,
    visibility: r.visibility,
    status: r.status,
    isOwn: r.is_own,
    locked: r.locked,
    priceCredits: r.price_credits,
    priceAmount: r.price_amount,
    priceCurrency: r.price_currency,
    lastUpdatedAt: r.last_updated_at,
    itemCount: r.item_count,
    levelCounts: levelMap.get(r.id) ?? {},
    categories: (r.categories ?? []).filter(Boolean),
  }));
}

/** Distinct playbook categories in scope — drives the catalog's filter pills. */
export async function listCategories(client: TenantClient): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT DISTINCT p.category FROM qa_playbooks p WHERE ${SCOPE} ORDER BY p.category ASC`,
    [client.tenantId]
  );
  return rows.map((r: any) => r.category);
}

/**
 * One playbook with its section tree.
 *
 * On a LOCKED premium playbook the structure still comes back — titles,
 * descriptions and per-section counts — but `items` is empty everywhere. The
 * reader renders that as a preview with the bodies behind a lock, which is the
 * whole point of listing premium content in the first place.
 *
 * `levels` / `categories` filter the items only; a section left empty by the
 * filter is dropped so the tree never shows a hollow heading.
 */
export async function getPlaybookBySlug(
  client: TenantClient,
  slug: string,
  filters: { levels?: string[]; categories?: string[]; includeAll?: boolean } = {}
): Promise<PlaybookDetail | null> {
  const { rows: playbooks } = await client.query(
    `SELECT p.id, p.slug, p.name, p.category, p.summary, p.overview, p.version,
            p.visibility, p.status, p.price_credits, p.price_amount, p.price_currency,
            p.last_updated_at, p.tenant_id,
            p.tenant_id IS NOT NULL AS is_own,
            NOT ${UNLOCKED} AS locked
       FROM qa_playbooks p
      WHERE ${filters.includeAll ? 'TRUE' : SCOPE} AND p.slug = $2
      -- A tenant's own playbook wins over a platform one of the same slug.
      ORDER BY p.tenant_id NULLS LAST
      LIMIT 1`,
    [client.tenantId, slug]
  );
  if (playbooks.length === 0) return null;
  const playbook: any = playbooks[0];
  const locked = playbook.locked && !filters.includeAll;

  const { rows: sectionRows } = await client.query(
    `SELECT id, key, parent_section_id, title, description, sort_order
       FROM qa_playbook_sections
      WHERE playbook_id = $1
      ORDER BY sort_order ASC, title ASC`,
    [playbook.id]
  );

  const itemsBySection = new Map<string, PlaybookItemRow[]>();
  const countBySection = new Map<string, number>();

  // A locked playbook still reports how much is behind the lock, so the preview
  // can say "14 recommendations" rather than an unexplained empty section.
  const { rows: counts } = await client.query(
    `SELECT section_id, COUNT(*)::int AS count FROM qa_playbook_items
      WHERE playbook_id = $1 GROUP BY section_id`,
    [playbook.id]
  );
  for (const row of counts as any[]) countBySection.set(row.section_id, row.count);

  if (!locked) {
    const itemParams: any[] = [playbook.id];
    let itemWhere = `WHERE playbook_id = $1`;
    if (filters.levels?.length) {
      itemParams.push(filters.levels);
      itemWhere += ` AND level = ANY($${itemParams.length}::text[])`;
    }
    if (filters.categories?.length) {
      itemParams.push(filters.categories);
      itemWhere += ` AND category = ANY($${itemParams.length}::text[])`;
    }

    const { rows: itemRows } = await client.query(
      `SELECT id, key, section_id, title, what_to_test, examples, expected, steps,
              preconditions, edge_cases, "references",
              level, category, risk, why_it_matters, applies_when
         FROM qa_playbook_items
         ${itemWhere}
         ORDER BY sort_order ASC`,
      itemParams
    );

    for (const row of itemRows as any[]) {
      const list = itemsBySection.get(row.section_id) ?? [];
      list.push(mapItem(row));
      itemsBySection.set(row.section_id, list);
    }
  }

  const byId = new Map<string, PlaybookSectionRow>();
  for (const row of sectionRows as any[]) {
    byId.set(row.id, {
      id: row.id,
      key: row.key,
      parentSectionId: row.parent_section_id,
      title: row.title,
      description: row.description,
      items: itemsBySection.get(row.id) ?? [],
      itemCount: countBySection.get(row.id) ?? 0,
      sections: [],
    });
  }

  const roots: PlaybookSectionRow[] = [];
  for (const row of sectionRows as any[]) {
    const node = byId.get(row.id)!;
    if (row.parent_section_id && byId.has(row.parent_section_id)) {
      byId.get(row.parent_section_id)!.sections.push(node);
    } else {
      roots.push(node);
    }
  }

  const prune = (nodes: PlaybookSectionRow[]): PlaybookSectionRow[] =>
    nodes
      .map((n) => ({ ...n, sections: prune(n.sections) }))
      .filter((n) => n.items.length > 0 || n.sections.length > 0);

  const filtered =
    !locked && (filters.levels?.length || filters.categories?.length) ? prune(roots) : roots;

  const { rows: versions } = await client.query(
    `SELECT version, changelog, item_count, published_at
       FROM qa_playbook_versions WHERE playbook_id = $1 ORDER BY published_at DESC`,
    [playbook.id]
  );

  const { rows: facets } = await client.query(
    `SELECT level, category, COUNT(*)::int AS count
       FROM qa_playbook_items WHERE playbook_id = $1 GROUP BY level, category`,
    [playbook.id]
  );
  const levelCounts: Record<string, number> = {};
  const categorySet = new Set<string>();
  let itemCount = 0;
  for (const row of facets as any[]) {
    levelCounts[row.level] = (levelCounts[row.level] ?? 0) + row.count;
    categorySet.add(row.category);
    itemCount += row.count;
  }

  const { rows: pending } = await client.query(
    `SELECT 1 FROM qa_playbook_unlock_requests
      WHERE playbook_id = $1 AND tenant_id = $2 AND status = 'pending' LIMIT 1`,
    [playbook.id, client.tenantId]
  );

  return {
    id: playbook.id,
    slug: playbook.slug,
    name: playbook.name,
    category: playbook.category,
    summary: playbook.summary,
    overview: playbook.overview,
    version: playbook.version,
    visibility: playbook.visibility,
    status: playbook.status,
    isOwn: playbook.is_own,
    locked,
    priceCredits: playbook.price_credits,
    priceAmount: playbook.price_amount,
    priceCurrency: playbook.price_currency,
    lastUpdatedAt: playbook.last_updated_at,
    itemCount,
    levelCounts,
    categories: [...categorySet],
    sections: filtered,
    versions: (versions as any[]).map((v) => ({
      version: v.version,
      changelog: v.changelog,
      itemCount: v.item_count,
      publishedAt: v.published_at,
    })),
    pendingRequest: pending.length > 0,
  };
}

function mapItem(row: any): PlaybookItemRow {
  return {
    id: row.id,
    key: row.key,
    sectionId: row.section_id,
    title: row.title,
    whatToTest: row.what_to_test,
    examples: row.examples ?? [],
    expected: row.expected,
    steps: row.steps ?? [],
    level: row.level,
    category: row.category,
    risk: row.risk,
    whyItMatters: row.why_it_matters,
    preconditions: row.preconditions ?? [],
    edgeCases: row.edge_cases ?? [],
    references: row.references ?? [],
    appliesWhen: row.applies_when ?? {},
  };
}

/**
 * The items a generate request selected.
 *
 * Scoped through UNLOCKED as well as SCOPE: without that, a tenant could read
 * a premium playbook's entire body by posting item ids to the generate
 * endpoint and reading the test cases it created.
 */
export async function getItemsByIds(
  client: TenantClient,
  playbookId: string,
  itemIds: string[]
): Promise<PlaybookItemRow[]> {
  const { rows } = await client.query(
    `SELECT i.id, i.key, i.section_id, i.title, i.what_to_test, i.examples, i.expected, i.steps,
            i.preconditions, i.edge_cases, i."references",
            i.level, i.category, i.risk, i.why_it_matters, i.applies_when,
            s.title AS section_title
       FROM qa_playbook_items i
       JOIN qa_playbook_sections s ON s.id = i.section_id
       JOIN qa_playbooks p ON p.id = i.playbook_id
      WHERE i.playbook_id = $2 AND i.id = ANY($3::uuid[])
        AND ${SCOPE} AND ${UNLOCKED}
      ORDER BY s.sort_order ASC, i.sort_order ASC`,
    [client.tenantId, playbookId, itemIds]
  );

  return (rows as any[]).map((row) => ({ ...mapItem(row), sectionTitle: row.section_title }));
}

export async function recordGeneration(
  client: TenantClient,
  input: {
    playbookId: string;
    projectId: string | null;
    moduleId: string | null;
    parentTestCaseId: string;
    itemKeys: string[];
    createdCount: number;
    createdBy: string | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO qa_playbook_generations
       (tenant_id, playbook_id, project_id, module_id, parent_test_case_id, item_keys, created_count, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      client.tenantId,
      input.playbookId,
      input.projectId,
      input.moduleId,
      input.parentTestCaseId,
      JSON.stringify(input.itemKeys),
      input.createdCount,
      input.createdBy,
    ]
  );
}

/* ── Authoring ───────────────────────────────────────────────────────────── */

/** Unique per owner. Two tenants may both have a "login" playbook. */
async function uniqueSlug(
  client: TenantClient,
  ownerTenantId: string | null,
  name: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(name) || 'playbook';
  for (let n = 0; n < 200; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const { rows } = await client.query(
      `SELECT 1 FROM qa_playbooks
        WHERE slug = $1
          AND tenant_id IS NOT DISTINCT FROM $2::uuid
          AND ($3::uuid IS NULL OR id <> $3::uuid)
        LIMIT 1`,
      [candidate, ownerTenantId, excludeId ?? null]
    );
    if (rows.length === 0) return candidate;
  }
  throw new Error('Could not derive a unique slug');
}

export interface MetaInput {
  name: string;
  category: string;
  summary: string;
  overview: string;
  version: string;
  visibility: PlaybookVisibility;
  priceCredits: number | null;
  priceAmount: number | null;
  priceCurrency: string;
}

export async function createPlaybook(
  client: TenantClient,
  input: MetaInput & { ownerTenantId: string | null; createdBy: string | null }
): Promise<{ id: string; slug: string }> {
  const slug = await uniqueSlug(client, input.ownerTenantId, input.name);
  const { rows } = await client.query(
    `INSERT INTO qa_playbooks
       (tenant_id, slug, name, category, summary, overview, version, visibility, status,
        price_credits, price_amount, price_currency, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12, $12)
     RETURNING id, slug`,
    [
      input.ownerTenantId,
      slug,
      input.name,
      input.category,
      input.summary,
      input.overview,
      input.version,
      input.visibility,
      input.priceCredits,
      input.priceAmount,
      input.priceCurrency,
      input.createdBy,
    ]
  );
  return rows[0];
}

export async function updatePlaybookMeta(
  client: TenantClient,
  playbookId: string,
  input: MetaInput & { updatedBy: string | null }
): Promise<{ id: string; slug: string }> {
  const { rows: current } = await client.query(
    `SELECT tenant_id, name FROM qa_playbooks WHERE id = $1`,
    [playbookId]
  );
  if (current.length === 0) return null as any;

  // The slug follows the name, but only while the name is actually changing —
  // an unrelated edit must not break links people have already shared.
  const slug =
    current[0].name === input.name
      ? undefined
      : await uniqueSlug(client, current[0].tenant_id, input.name, playbookId);

  const { rows } = await client.query(
    `UPDATE qa_playbooks
        SET name = $2, category = $3, summary = $4, overview = $5, version = $6,
            visibility = $7, price_credits = $8, price_amount = $9, price_currency = $10,
            slug = COALESCE($11, slug),
            updated_by = $12, updated_at = NOW(), last_updated_at = NOW()
      WHERE id = $1
      RETURNING id, slug`,
    [
      playbookId,
      input.name,
      input.category,
      input.summary,
      input.overview,
      input.version,
      input.visibility,
      input.priceCredits,
      input.priceAmount,
      input.priceCurrency,
      slug ?? null,
      input.updatedBy,
    ]
  );
  return rows[0];
}

interface FlatSection {
  key: string;
  title: string;
  description: string | null;
  parentKey: string | null;
  sortOrder: number;
  items: any[];
}

/** Depth-first, parents before children, preserving author order per level. */
function flatten(sections: any[], parentKey: string | null = null, prefix = ''): FlatSection[] {
  const out: FlatSection[] = [];
  sections.forEach((section, index) => {
    // Keys are the stable handle a generation audit row records. Authors do not
    // type them, so they are derived from position when absent.
    const key = section.key || `${prefix}s${index + 1}`;
    out.push({
      key,
      title: section.title,
      description: section.description ?? null,
      parentKey,
      sortOrder: index,
      items: section.items ?? [],
    });
    out.push(...flatten(section.sections ?? [], key, `${key}-`));
  });
  return out;
}

function countItems(sections: any[]): number {
  return sections.reduce(
    (total, s) => total + (s.items?.length ?? 0) + countItems(s.sections ?? []),
    0
  );
}

/**
 * Replace a playbook's whole section tree.
 *
 * Wholesale replacement rather than row-by-row reconciliation: a playbook is
 * edited as one document, and a partial save would let an author end up with
 * half their reordering applied. Nothing references item ids — generation audit
 * rows record item *keys* — so replacing rows cannot orphan anything.
 *
 * The caller runs this inside withTenant, so it is already one transaction.
 */
export async function replaceContent(
  client: TenantClient,
  playbookId: string,
  // Loosely typed on purpose: this project compiles with strictNullChecks off,
  // which makes every zod-inferred field optional. The schema in validators/
  // has already guaranteed the shape by the time this runs.
  body: { sections?: any[]; version?: string; changelog?: string | null },
  updatedBy: string | null
): Promise<{ itemCount: number }> {
  const sections = body.sections ?? [];
  await client.query(`DELETE FROM qa_playbook_sections WHERE playbook_id = $1`, [playbookId]);

  const flat = flatten(sections);
  const sectionIdByKey = new Map<string, string>();

  for (const section of flat) {
    const { rows } = await client.query(
      `INSERT INTO qa_playbook_sections
         (playbook_id, parent_section_id, key, title, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        playbookId,
        section.parentKey ? sectionIdByKey.get(section.parentKey) ?? null : null,
        section.key,
        section.title,
        section.description,
        section.sortOrder,
      ]
    );
    sectionIdByKey.set(section.key, rows[0].id);
  }

  for (const section of flat) {
    const sectionId = sectionIdByKey.get(section.key)!;
    for (let i = 0; i < section.items.length; i += 1) {
      const item = section.items[i];
      await client.query(
        `INSERT INTO qa_playbook_items
           (playbook_id, section_id, key, title, what_to_test, examples, expected, steps,
            level, category, risk, why_it_matters, applies_when, sort_order,
            preconditions, edge_cases, "references")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb, $14,
                 $15::jsonb, $16::jsonb, $17::jsonb)`,
        [
          playbookId,
          sectionId,
          item.key || `${section.key}-i${i + 1}`,
          item.title,
          item.what_to_test ?? '',
          JSON.stringify(item.examples ?? []),
          item.expected ?? '',
          JSON.stringify(item.steps ?? []),
          item.level,
          item.category,
          item.risk ?? 'medium',
          item.why_it_matters ?? '',
          JSON.stringify(item.applies_when ?? {}),
          i,
          JSON.stringify(item.preconditions ?? []),
          JSON.stringify(item.edge_cases ?? []),
          JSON.stringify(item.references ?? []),
        ]
      );
    }
  }

  const itemCount = countItems(sections);

  if (body.version) {
    await client.query(
      `UPDATE qa_playbooks SET version = $2, updated_by = $3, updated_at = NOW(), last_updated_at = NOW()
        WHERE id = $1`,
      [playbookId, body.version, updatedBy]
    );
    await client.query(
      `INSERT INTO qa_playbook_versions (playbook_id, version, changelog, item_count, published_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (playbook_id, version)
       DO UPDATE SET changelog = EXCLUDED.changelog, item_count = EXCLUDED.item_count, published_at = NOW()`,
      [playbookId, body.version, body.changelog ?? null, itemCount, updatedBy]
    );
  } else {
    await client.query(
      `UPDATE qa_playbooks SET updated_by = $2, updated_at = NOW(), last_updated_at = NOW() WHERE id = $1`,
      [playbookId, updatedBy]
    );
  }

  return { itemCount };
}

export async function setStatus(
  client: TenantClient,
  playbookId: string,
  status: string,
  updatedBy: string | null
): Promise<void> {
  await client.query(
    `UPDATE qa_playbooks SET status = $2, updated_by = $3, updated_at = NOW() WHERE id = $1`,
    [playbookId, status, updatedBy]
  );
}

export async function deletePlaybook(client: TenantClient, playbookId: string): Promise<void> {
  await client.query(`DELETE FROM qa_playbooks WHERE id = $1`, [playbookId]);
}

/**
 * The row an authoring or access request acts on, with just enough to decide
 * whether the caller is allowed to act on it.
 */
export async function getOwnership(
  client: TenantClient,
  playbookId: string
): Promise<{ id: string; slug: string; name: string; tenantId: string | null; visibility: string; status: string } | null> {
  const { rows } = await client.query(
    `SELECT id, slug, name, tenant_id, visibility, status FROM qa_playbooks WHERE id = $1`,
    [playbookId]
  );
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    slug: rows[0].slug,
    name: rows[0].name,
    tenantId: rows[0].tenant_id,
    visibility: rows[0].visibility,
    status: rows[0].status,
  };
}

/* ── Access: requests and grants ─────────────────────────────────────────── */

export async function requestUnlock(
  client: TenantClient,
  playbookId: string,
  requestedBy: string | null,
  message: string | null
): Promise<{ id: string; alreadyOpen: boolean }> {
  const { rows: open } = await client.query(
    `SELECT id FROM qa_playbook_unlock_requests
      WHERE playbook_id = $1 AND tenant_id = $2 AND status = 'pending' LIMIT 1`,
    [playbookId, client.tenantId]
  );
  if (open.length > 0) return { id: open[0].id, alreadyOpen: true };

  const { rows } = await client.query(
    `INSERT INTO qa_playbook_unlock_requests (playbook_id, tenant_id, requested_by, message)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [playbookId, client.tenantId, requestedBy, message]
  );
  return { id: rows[0].id, alreadyOpen: false };
}

export async function listUnlockRequests(
  client: TenantClient,
  status: string | undefined
): Promise<any[]> {
  const params: any[] = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE r.status = $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT r.id, r.playbook_id, r.tenant_id, r.message, r.status, r.created_at,
            r.decided_at, r.decision_note,
            p.name AS playbook_name, p.slug AS playbook_slug,
            p.price_credits, p.price_amount, p.price_currency,
            t.name AS tenant_name, t.subdomain AS tenant_subdomain,
            u.name AS requested_by_name
       FROM qa_playbook_unlock_requests r
       JOIN qa_playbooks p ON p.id = r.playbook_id
       -- tenants.id and users.id are TEXT in this database while these columns
       -- are uuid, so both joins cast. Without it Postgres raises
       -- "operator does not exist: text = uuid".
       LEFT JOIN tenants t ON t.id::text = r.tenant_id::text
       LEFT JOIN users u ON u.id::text = r.requested_by::text
       ${where}
       ORDER BY r.created_at DESC
       LIMIT 200`,
    params
  );
  return rows;
}

export async function decideUnlockRequest(
  client: TenantClient,
  requestId: string,
  decision: 'approved' | 'declined',
  decidedBy: string | null,
  note: string | null,
  expiresAt: string | null
): Promise<{ playbookId: string; tenantId: string } | null> {
  const { rows } = await client.query(
    `UPDATE qa_playbook_unlock_requests
        SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = $4
      WHERE id = $1 AND status = 'pending'
      RETURNING playbook_id, tenant_id`,
    [requestId, decision, decidedBy, note]
  );
  if (rows.length === 0) return null;

  if (decision === 'approved') {
    await grantUnlock(client, rows[0].playbook_id, rows[0].tenant_id, decidedBy, note, expiresAt);
  }
  return { playbookId: rows[0].playbook_id, tenantId: rows[0].tenant_id };
}

export async function grantUnlock(
  client: TenantClient,
  playbookId: string,
  tenantId: string,
  grantedBy: string | null,
  note: string | null,
  expiresAt: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO qa_playbook_unlocks (playbook_id, tenant_id, origin, note, granted_by, expires_at)
     VALUES ($1, $2, 'admin_grant', $3, $4, $5)
     ON CONFLICT (playbook_id, tenant_id)
     DO UPDATE SET note = EXCLUDED.note, granted_by = EXCLUDED.granted_by,
                   granted_at = NOW(), expires_at = EXCLUDED.expires_at`,
    [playbookId, tenantId, note, grantedBy, expiresAt]
  );
}

export async function revokeUnlock(
  client: TenantClient,
  playbookId: string,
  tenantId: string
): Promise<void> {
  await client.query(
    `DELETE FROM qa_playbook_unlocks WHERE playbook_id = $1 AND tenant_id = $2`,
    [playbookId, tenantId]
  );
}

/* ── "Write us a playbook for this" requests ─────────────────────────────── */

export async function createPlaybookRequest(
  client: TenantClient,
  input: {
    requestedBy: string | null;
    title: string;
    category: string | null;
    details: string | null;
  }
): Promise<{ id: string; alreadyOpen: boolean }> {
  /* An ask already on the list is not a second ask. Checked here as well as by
     the partial unique index so the caller gets "we already have this" rather
     than a constraint violation. */
  const { rows: open } = await client.query(
    `SELECT id FROM qa_playbook_requests
      WHERE tenant_id = $1 AND lower(title) = lower($2)
        AND status IN ('pending', 'planned')
      LIMIT 1`,
    [client.tenantId, input.title]
  );
  if (open.length > 0) return { id: open[0].id, alreadyOpen: true };

  const { rows } = await client.query(
    `INSERT INTO qa_playbook_requests (tenant_id, requested_by, title, category, details)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [client.tenantId, input.requestedBy, input.title, input.category, input.details]
  );
  return { id: rows[0].id, alreadyOpen: false };
}

/**
 * `mine` scopes to the asking workspace. Without it this reads every tenant's
 * requests, so the controller only passes false for a super_admin.
 */
export async function listPlaybookRequests(
  client: TenantClient,
  filters: { status?: string; mine: boolean }
): Promise<any[]> {
  const params: any[] = [];
  const clauses: string[] = [];

  if (filters.mine) {
    params.push(client.tenantId);
    clauses.push(`r.tenant_id = $${params.length}`);
  }
  if (filters.status && filters.status !== 'all') {
    params.push(filters.status);
    clauses.push(`r.status = $${params.length}`);
  }

  const { rows } = await client.query(
    `SELECT r.id, r.tenant_id, r.title, r.category, r.details, r.status,
            r.decision_note, r.decided_at, r.created_at, r.playbook_id,
            p.name AS playbook_name, p.slug AS playbook_slug,
            -- tenants.id and users.id are TEXT here while these columns are
            -- uuid, so both joins cast, exactly as listUnlockRequests does.
            t.name AS tenant_name, t.subdomain AS tenant_subdomain,
            u.name AS requested_by_name
       FROM qa_playbook_requests r
       LEFT JOIN qa_playbooks p ON p.id = r.playbook_id
       LEFT JOIN tenants t ON t.id::text = r.tenant_id::text
       LEFT JOIN users u ON u.id::text = r.requested_by::text
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY r.created_at DESC
       LIMIT 200`,
    params
  );
  return rows;
}

export async function decidePlaybookRequest(
  client: TenantClient,
  requestId: string,
  input: {
    status: 'pending' | 'planned' | 'published' | 'declined';
    decidedBy: string | null;
    note: string | null;
    playbookId: string | null;
  }
): Promise<{ id: string; tenantId: string } | null> {
  const { rows } = await client.query(
    `UPDATE qa_playbook_requests
        SET status = $2,
            decided_by = $3,
            decided_at = CASE WHEN $2 = 'pending' THEN NULL ELSE NOW() END,
            decision_note = COALESCE($4, decision_note),
            playbook_id = COALESCE($5, playbook_id)
      WHERE id = $1
      RETURNING id, tenant_id`,
    [requestId, input.status, input.decidedBy, input.note, input.playbookId]
  );
  return rows.length ? { id: rows[0].id, tenantId: rows[0].tenant_id } : null;
}

export async function listUnlocks(client: TenantClient, playbookId: string): Promise<any[]> {
  const { rows } = await client.query(
    `SELECT u.id, u.tenant_id, u.origin, u.granted_at, u.expires_at, u.note,
            t.name AS tenant_name, t.subdomain AS tenant_subdomain
       FROM qa_playbook_unlocks u
       LEFT JOIN tenants t ON t.id::text = u.tenant_id::text
      WHERE u.playbook_id = $1
      ORDER BY u.granted_at DESC`,
    [playbookId]
  );
  return rows;
}
