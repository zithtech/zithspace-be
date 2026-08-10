// src/modules/hotspot/repositories/circulation.repo.ts
//
// Raw SQL for the Circulation noticeboard. Every query filters `tenant_id = $1`
// explicitly on top of RLS — see db/pool.ts for why both layers exist.
//
// Author display fields (name, avatar, designation) are LEFT JOINed from the
// Prisma-owned `users` / `positions` tables. Those ids are text, ours are uuid,
// hence the `::text` casts. The join is best-effort: a deactivated or purged
// user leaves the post readable with a null author name.

import { TenantClient } from '../db/pool';
import {
  CirculationAttachment,
  CirculationAuthor,
  CirculationCategoryItem,
  CirculationListQuery,
  CirculationPost,
  CirculationPostInput,
  NewAttachment,
} from '../types';

const POST_COLUMNS = `
  p.id,
  p.title,
  p.body,
  p.body_text,
  p.category,
  p.is_pinned,
  p.author_user_id,
  p.created_at,
  p.updated_at,
  u.name        AS author_name,
  u.avatar_url  AS author_avatar_url,
  pos.title     AS author_designation,
  cat.label     AS category_label
`;

const POST_FROM = `
  FROM hs_circulation_posts p
  LEFT JOIN users u
    ON u.id = p.author_user_id AND u.tenant_id = p.tenant_id::text
  LEFT JOIN positions pos
    ON pos.id = u.position_id AND pos.tenant_id = u.tenant_id
  LEFT JOIN hs_circulation_categories cat
    ON cat.key = p.category AND cat.tenant_id = p.tenant_id
`;

interface PostRow {
  id: string;
  title: string;
  body: string;
  body_text: string;
  category: string;
  is_pinned: boolean;
  author_user_id: string;
  created_at: Date;
  updated_at: Date;
  author_name: string | null;
  author_avatar_url: string | null;
  author_designation: string | null;
  category_label: string | null;
}

interface AttachmentRow {
  id: string;
  post_id: string;
  kind: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: string | number | null;
  sort_order: number;
  uploaded_by: string;
  created_at: Date;
}

function mapAttachment(r: AttachmentRow): CirculationAttachment {
  return {
    id: r.id,
    postId: r.post_id,
    kind: r.kind as CirculationAttachment['kind'],
    fileName: r.file_name,
    fileUrl: r.file_url,
    fileType: r.file_type,
    // bigint comes back as a string from pg; keep the API numeric.
    fileSize: r.file_size == null ? null : Number(r.file_size),
    sortOrder: r.sort_order,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at.toISOString(),
  };
}

function mapPost(r: PostRow, attachments: CirculationAttachment[]): CirculationPost {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    bodyText: r.body_text,
    category: r.category,
    categoryLabel: r.category_label,
    isPinned: r.is_pinned,
    authorUserId: r.author_user_id,
    authorName: r.author_name,
    authorAvatarUrl: r.author_avatar_url,
    authorDesignation: r.author_designation,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    attachments,
    // Filled in by the service, which knows the caller.
    canEdit: false,
  };
}

/** Attachments for a set of posts, grouped by post id. */
async function attachmentsFor(
  client: TenantClient,
  postIds: string[]
): Promise<Map<string, CirculationAttachment[]>> {
  const grouped = new Map<string, CirculationAttachment[]>();
  if (postIds.length === 0) return grouped;

  const { rows } = await client.query<AttachmentRow>(
    `SELECT id, post_id, kind, file_name, file_url, file_type, file_size,
            sort_order, uploaded_by, created_at
       FROM hs_circulation_attachments
      WHERE tenant_id = $1 AND post_id = ANY($2::uuid[])
      ORDER BY sort_order, created_at`,
    [client.tenantId, postIds]
  );

  for (const row of rows) {
    const list = grouped.get(row.post_id) ?? [];
    list.push(mapAttachment(row));
    grouped.set(row.post_id, list);
  }
  return grouped;
}

/**
 * One page of the feed. Pinned posts always sort first, then newest-first.
 * Search matches the title or the plain-text body projection — never the HTML,
 * so a query like "table" cannot match a `<table>` tag.
 */
export async function listPosts(
  client: TenantClient,
  query: CirculationListQuery,
  callerUserId: string
): Promise<{ rows: CirculationPost[]; total: number }> {
  const where: string[] = ['p.tenant_id = $1', 'p.deleted_at IS NULL'];
  const params: any[] = [client.tenantId];

  if (query.search) {
    params.push(`%${query.search}%`);
    where.push(`(p.title ILIKE $${params.length} OR p.body_text ILIKE $${params.length})`);
  }
  if (query.category) {
    params.push(query.category);
    where.push(`p.category = $${params.length}`);
  }
  // An explicit author wins over `mineOnly` — picking someone in the dropdown
  // should not silently AND with "only mine" and return nothing.
  const author = query.authorUserId || (query.mineOnly ? callerUserId : null);
  if (author) {
    params.push(author);
    where.push(`p.author_user_id = $${params.length}`);
  }

  const whereSql = where.join(' AND ');

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM hs_circulation_posts p WHERE ${whereSql}`,
    params
  );
  const total = Number(countRes.rows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  params.push(query.pageSize, offset);

  const { rows } = await client.query<PostRow>(
    `SELECT ${POST_COLUMNS}
     ${POST_FROM}
      WHERE ${whereSql}
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const attachments = await attachmentsFor(
    client,
    rows.map((r) => r.id)
  );

  return {
    rows: rows.map((r) => mapPost(r, attachments.get(r.id) ?? [])),
    total,
  };
}

export async function findPostById(
  client: TenantClient,
  id: string
): Promise<CirculationPost | null> {
  const { rows } = await client.query<PostRow>(
    `SELECT ${POST_COLUMNS}
     ${POST_FROM}
      WHERE p.tenant_id = $1 AND p.id = $2 AND p.deleted_at IS NULL`,
    [client.tenantId, id]
  );
  const row = rows[0];
  if (!row) return null;

  const attachments = await attachmentsFor(client, [row.id]);
  return mapPost(row, attachments.get(row.id) ?? []);
}

export async function insertPost(
  client: TenantClient,
  authorUserId: string,
  input: CirculationPostInput
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO hs_circulation_posts
       (tenant_id, title, body, body_text, category, is_pinned, author_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      client.tenantId,
      input.title,
      input.body,
      input.bodyText,
      input.category,
      input.isPinned,
      authorUserId,
    ]
  );
  return rows[0].id;
}

/** Partial update. Returns false when the post does not exist (or is deleted). */
export async function updatePost(
  client: TenantClient,
  id: string,
  patch: Partial<CirculationPostInput>
): Promise<boolean> {
  const sets: string[] = [];
  const params: any[] = [client.tenantId, id];

  const push = (column: string, value: any) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.title !== undefined) push('title', patch.title);
  if (patch.body !== undefined) push('body', patch.body);
  if (patch.bodyText !== undefined) push('body_text', patch.bodyText);
  if (patch.category !== undefined) push('category', patch.category);
  if (patch.isPinned !== undefined) push('is_pinned', patch.isPinned);

  if (sets.length === 0) return true;
  sets.push('updated_at = now()');

  const { rowCount } = await client.query(
    `UPDATE hs_circulation_posts
        SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    params
  );
  return (rowCount ?? 0) > 0;
}

/** Soft delete — the feed filters on deleted_at IS NULL. */
export async function softDeletePost(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE hs_circulation_posts
        SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return (rowCount ?? 0) > 0;
}

/** Next free sort_order for a post, so appended files keep upload order. */
export async function nextAttachmentSortOrder(
  client: TenantClient,
  postId: string
): Promise<number> {
  const { rows } = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM hs_circulation_attachments
      WHERE tenant_id = $1 AND post_id = $2`,
    [client.tenantId, postId]
  );
  return rows[0]?.next ?? 0;
}

export async function insertAttachments(
  client: TenantClient,
  postId: string,
  uploadedBy: string,
  files: NewAttachment[],
  startSortOrder: number
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    await client.query(
      `INSERT INTO hs_circulation_attachments
         (tenant_id, post_id, kind, file_name, file_url, file_type, file_size, sort_order, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        client.tenantId,
        postId,
        f.kind,
        f.fileName,
        f.fileUrl,
        f.fileType,
        f.fileSize,
        startSortOrder + i,
        uploadedBy,
      ]
    );
  }
}

export async function deleteAttachment(
  client: TenantClient,
  postId: string,
  attachmentId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM hs_circulation_attachments
      WHERE tenant_id = $1 AND post_id = $2 AND id = $3`,
    [client.tenantId, postId, attachmentId]
  );
  return (rowCount ?? 0) > 0;
}

/** Post counts per category for the sidebar filter chips. */
export async function countByCategory(
  client: TenantClient
): Promise<Record<string, number>> {
  const { rows } = await client.query<{ category: string; count: string }>(
    `SELECT category, COUNT(*)::text AS count
       FROM hs_circulation_posts
      WHERE tenant_id = $1 AND deleted_at IS NULL
      GROUP BY category`,
    [client.tenantId]
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = Number(r.count);
  return out;
}

// ─── Tenant-defined categories ──────────────────────────────────────────────

interface CategoryRow {
  id: string;
  key: string;
  label: string;
}

/** The tenant's own categories, alphabetical. Built-ins live in code. */
export async function listCustomCategories(
  client: TenantClient
): Promise<Omit<CirculationCategoryItem, 'postCount'>[]> {
  const { rows } = await client.query<CategoryRow>(
    `SELECT id, key, label
       FROM hs_circulation_categories
      WHERE tenant_id = $1
      ORDER BY lower(label)`,
    [client.tenantId]
  );
  return rows.map((r) => ({ id: r.id, key: r.key, label: r.label, isBuiltIn: false }));
}

export async function findCategoryByKeyOrLabel(
  client: TenantClient,
  key: string,
  label: string
): Promise<CategoryRow | null> {
  const { rows } = await client.query<CategoryRow>(
    `SELECT id, key, label
       FROM hs_circulation_categories
      WHERE tenant_id = $1 AND (lower(key) = lower($2) OR lower(label) = lower($3))
      LIMIT 1`,
    [client.tenantId, key, label]
  );
  return rows[0] ?? null;
}

export async function insertCategory(
  client: TenantClient,
  createdBy: string,
  key: string,
  label: string
): Promise<CategoryRow> {
  const { rows } = await client.query<CategoryRow>(
    `INSERT INTO hs_circulation_categories (tenant_id, key, label, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, key, label`,
    [client.tenantId, key, label, createdBy]
  );
  return rows[0];
}

export async function findCategoryById(
  client: TenantClient,
  id: string
): Promise<CategoryRow | null> {
  const { rows } = await client.query<CategoryRow>(
    `SELECT id, key, label
       FROM hs_circulation_categories
      WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id]
  );
  return rows[0] ?? null;
}

export async function deleteCategory(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM hs_circulation_categories WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id]
  );
  return (rowCount ?? 0) > 0;
}

/** Live posts using a category key — what makes a delete safe or not. */
export async function countPostsInCategory(
  client: TenantClient,
  key: string
): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM hs_circulation_posts
      WHERE tenant_id = $1 AND category = $2 AND deleted_at IS NULL`,
    [client.tenantId, key]
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * People who have actually circulated something, for the "posted by" dropdown.
 *
 * Built from the posts rather than the user directory on purpose: a dropdown of
 * every employee is a scrolling exercise, and picking someone who has never
 * posted can only ever return an empty feed.
 */
export async function listAuthors(client: TenantClient): Promise<CirculationAuthor[]> {
  const { rows } = await client.query<{
    id: string;
    name: string | null;
    avatar_url: string | null;
    designation: string | null;
    count: string;
  }>(
    `SELECT p.author_user_id AS id,
            u.name,
            u.avatar_url,
            pos.title AS designation,
            COUNT(*)::text AS count
       FROM hs_circulation_posts p
       LEFT JOIN users u ON u.id = p.author_user_id AND u.tenant_id = p.tenant_id::text
       LEFT JOIN positions pos ON pos.id = u.position_id AND pos.tenant_id = u.tenant_id
      WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
      GROUP BY p.author_user_id, u.name, u.avatar_url, pos.title
      ORDER BY COUNT(*) DESC, u.name`,
    [client.tenantId]
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? 'Employee',
    avatarUrl: r.avatar_url,
    designation: r.designation,
    postCount: Number(r.count),
  }));
}