// src/modules/hotspot/repositories/blog.repo.ts
//
// Raw SQL for the Blogs feed. Every query filters `tenant_id = $1` explicitly on
// top of RLS — see db/pool.ts for why both layers exist.
//
// THE SHAPE OF THIS FILE: a feed page needs, per post, its images, its mentioned
// users, its reaction tally, the caller's own reaction and its comment count.
// Fetching those per post is the N+1 that makes social feeds slow, so every
// child collection is loaded ONCE for the whole page with `= ANY($n::uuid[])`
// and grouped in memory. Adding a new child collection? Follow that pattern.
//
// Author/mention display fields come from the Prisma-owned `users` / `positions`
// tables. Those ids are text, ours are uuid, hence the `::text` casts. The join
// is best-effort: a purged user leaves the row readable with a fallback name.

import { TenantClient } from '../db/pool';
import {
  BlogComment,
  BlogImage,
  BlogPost,
  BlogReaction,
  BlogUser,
  ReactionSummary,
} from '../types';

// ─── Users ──────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string | null;
  avatar_url: string | null;
  designation: string | null;
}

function mapUser(row: UserRow): BlogUser {
  return {
    id: row.id,
    name: row.name ?? 'Employee',
    avatarUrl: row.avatar_url,
    designation: row.designation,
  };
}

const USER_SELECT = `
  SELECT u.id, u.name, u.avatar_url, pos.title AS designation
    FROM users u
    LEFT JOIN positions pos ON pos.id = u.position_id AND pos.tenant_id = u.tenant_id
`;

/** Look up display info for a set of user ids, in one query. */
export async function findUsers(
  client: TenantClient,
  ids: string[]
): Promise<Map<string, BlogUser>> {
  const out = new Map<string, BlogUser>();
  if (ids.length === 0) return out;

  const { rows } = await client.query<UserRow>(
    `${USER_SELECT} WHERE u.tenant_id = $1 AND u.id = ANY($2::text[])`,
    [client.tenantId, ids]
  );
  for (const row of rows) out.set(row.id, mapUser(row));
  return out;
}

/** The @ picker: active colleagues in the tenant, name-matched. */
export async function searchMentionableUsers(
  client: TenantClient,
  search: string | undefined,
  limit: number
): Promise<BlogUser[]> {
  const params: any[] = [client.tenantId];
  let filter = '';

  if (search) {
    params.push(`%${search}%`);
    filter = `AND (u.name ILIKE $${params.length} OR u.work_email ILIKE $${params.length})`;
  }
  params.push(limit);

  const { rows } = await client.query<UserRow>(
    `${USER_SELECT}
      WHERE u.tenant_id = $1 AND u.is_active = true ${filter}
      ORDER BY u.name
      LIMIT $${params.length}`,
    params
  );
  return rows.map(mapUser);
}

/** Which of these ids are real, active users in the tenant. */
export async function filterExistingUserIds(
  client: TenantClient,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM users
      WHERE tenant_id = $1 AND is_active = true AND id = ANY($2::text[])`,
    [client.tenantId, ids]
  );
  return new Set(rows.map((r) => r.id));
}

// ─── Reactions ──────────────────────────────────────────────────────────────

/** Always a fresh object — a shared one would be mutated by the first caller. */
function emptySummary(): ReactionSummary {
  return { counts: {}, total: 0, mine: null };
}

/**
 * Reaction tallies for a batch of posts or comments, plus the caller's own pick.
 *
 * `column` is interpolated, NOT parameterised — Postgres has no placeholder for
 * an identifier. It is safe because the only two call sites pass a literal from
 * this file; never widen it to take caller input.
 */
async function reactionsFor(
  client: TenantClient,
  column: 'post_id' | 'comment_id',
  ids: string[],
  callerUserId: string
): Promise<Map<string, ReactionSummary>> {
  const grouped = new Map<string, ReactionSummary>();
  if (ids.length === 0) return grouped;

  const { rows } = await client.query<{
    target_id: string;
    reaction: BlogReaction;
    count: string;
    mine: boolean;
  }>(
    `SELECT ${column} AS target_id,
            reaction,
            COUNT(*)::text AS count,
            bool_or(user_id = $3) AS mine
       FROM hs_blog_reactions
      WHERE tenant_id = $1 AND ${column} = ANY($2::uuid[])
      GROUP BY ${column}, reaction`,
    [client.tenantId, ids, callerUserId]
  );

  for (const row of rows) {
    const summary = grouped.get(row.target_id) ?? emptySummary();
    const count = Number(row.count);
    summary.counts[row.reaction] = count;
    summary.total += count;
    if (row.mine) summary.mine = row.reaction;
    grouped.set(row.target_id, summary);
  }
  return grouped;
}

/**
 * Set or replace the caller's reaction. The partial unique index makes
 * "one reaction per user per target" a database guarantee, so this is an upsert
 * rather than a read-then-write that could race with a double click.
 */
export async function upsertReaction(
  client: TenantClient,
  target: { postId?: string; commentId?: string },
  userId: string,
  reaction: BlogReaction
): Promise<void> {
  const column = target.postId ? 'post_id' : 'comment_id';
  const id = target.postId ?? target.commentId;
  const conflictTarget =
    column === 'post_id'
      ? '(tenant_id, post_id, user_id) WHERE post_id IS NOT NULL'
      : '(tenant_id, comment_id, user_id) WHERE comment_id IS NOT NULL';

  await client.query(
    `INSERT INTO hs_blog_reactions (tenant_id, ${column}, user_id, reaction)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ${conflictTarget}
     DO UPDATE SET reaction = EXCLUDED.reaction, updated_at = now()`,
    [client.tenantId, id, userId, reaction]
  );
}

/**
 * The caller's current reaction on one target, or null.
 *
 * Exists so "tap the same reaction to clear it" can be decided with one small
 * query instead of re-reading a whole comment thread just to look at one row.
 */
export async function findMyReaction(
  client: TenantClient,
  target: { postId?: string; commentId?: string },
  userId: string
): Promise<BlogReaction | null> {
  const column = target.postId ? 'post_id' : 'comment_id';
  const id = target.postId ?? target.commentId;

  const { rows } = await client.query<{ reaction: BlogReaction }>(
    `SELECT reaction FROM hs_blog_reactions
      WHERE tenant_id = $1 AND ${column} = $2 AND user_id = $3`,
    [client.tenantId, id, userId]
  );
  return rows[0]?.reaction ?? null;
}

export async function deleteReaction(
  client: TenantClient,
  target: { postId?: string; commentId?: string },
  userId: string
): Promise<void> {
  const column = target.postId ? 'post_id' : 'comment_id';
  const id = target.postId ?? target.commentId;
  await client.query(
    `DELETE FROM hs_blog_reactions
      WHERE tenant_id = $1 AND ${column} = $2 AND user_id = $3`,
    [client.tenantId, id, userId]
  );
}

/** Who reacted, for the "liked by" list. Newest first, capped by the caller. */
export async function listReactors(
  client: TenantClient,
  target: { postId?: string; commentId?: string },
  limit: number
): Promise<{ user: BlogUser; reaction: BlogReaction }[]> {
  const column = target.postId ? 'post_id' : 'comment_id';
  const id = target.postId ?? target.commentId;

  const { rows } = await client.query<UserRow & { reaction: BlogReaction }>(
    `SELECT u.id, u.name, u.avatar_url, pos.title AS designation, r.reaction
       FROM hs_blog_reactions r
       LEFT JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id::text
       LEFT JOIN positions pos ON pos.id = u.position_id AND pos.tenant_id = u.tenant_id
      WHERE r.tenant_id = $1 AND r.${column} = $2
      ORDER BY r.created_at DESC
      LIMIT $3`,
    [client.tenantId, id, limit]
  );

  return rows
    .filter((r) => r.id)
    .map((r) => ({ user: mapUser(r), reaction: r.reaction }));
}

// ─── Mentions ───────────────────────────────────────────────────────────────

async function mentionsFor(
  client: TenantClient,
  column: 'post_id' | 'comment_id',
  ids: string[]
): Promise<Map<string, BlogUser[]>> {
  const grouped = new Map<string, BlogUser[]>();
  if (ids.length === 0) return grouped;

  const { rows } = await client.query<UserRow & { target_id: string }>(
    `SELECT m.${column} AS target_id, u.id, u.name, u.avatar_url, pos.title AS designation
       FROM hs_blog_mentions m
       LEFT JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id::text
       LEFT JOIN positions pos ON pos.id = u.position_id AND pos.tenant_id = u.tenant_id
      WHERE m.tenant_id = $1 AND m.${column} = ANY($2::uuid[])
      ORDER BY u.name`,
    [client.tenantId, ids]
  );

  for (const row of rows) {
    if (!row.id) continue; // user purged since the mention was written
    const list = grouped.get(row.target_id) ?? [];
    list.push(mapUser(row));
    grouped.set(row.target_id, list);
  }
  return grouped;
}

/** Replace the mention set for a post or comment. */
export async function setMentions(
  client: TenantClient,
  target: { postId?: string; commentId?: string },
  userIds: string[]
): Promise<void> {
  const column = target.postId ? 'post_id' : 'comment_id';
  const id = target.postId ?? target.commentId;

  await client.query(
    `DELETE FROM hs_blog_mentions WHERE tenant_id = $1 AND ${column} = $2`,
    [client.tenantId, id]
  );
  if (userIds.length === 0) return;

  await client.query(
    `INSERT INTO hs_blog_mentions (tenant_id, ${column}, user_id)
     SELECT $1, $2, unnest($3::text[])`,
    [client.tenantId, id, userIds]
  );
}

// ─── Images ─────────────────────────────────────────────────────────────────

interface ImageRow {
  id: string;
  post_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: string | number | null;
  sort_order: number;
  created_at: Date;
}

function mapImage(r: ImageRow): BlogImage {
  return {
    id: r.id,
    postId: r.post_id,
    fileName: r.file_name,
    fileUrl: r.file_url,
    fileType: r.file_type,
    // bigint comes back as a string from pg; keep the API numeric.
    fileSize: r.file_size == null ? null : Number(r.file_size),
    sortOrder: r.sort_order,
    createdAt: r.created_at.toISOString(),
  };
}

async function imagesFor(
  client: TenantClient,
  postIds: string[]
): Promise<Map<string, BlogImage[]>> {
  const grouped = new Map<string, BlogImage[]>();
  if (postIds.length === 0) return grouped;

  const { rows } = await client.query<ImageRow>(
    `SELECT id, post_id, file_name, file_url, file_type, file_size, sort_order, created_at
       FROM hs_blog_images
      WHERE tenant_id = $1 AND post_id = ANY($2::uuid[])
      ORDER BY sort_order, created_at`,
    [client.tenantId, postIds]
  );

  for (const row of rows) {
    const list = grouped.get(row.post_id) ?? [];
    list.push(mapImage(row));
    grouped.set(row.post_id, list);
  }
  return grouped;
}

export async function nextImageSortOrder(
  client: TenantClient,
  postId: string
): Promise<number> {
  const { rows } = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM hs_blog_images
      WHERE tenant_id = $1 AND post_id = $2`,
    [client.tenantId, postId]
  );
  return rows[0]?.next ?? 0;
}

export async function insertImages(
  client: TenantClient,
  postId: string,
  uploadedBy: string,
  images: { fileName: string; fileUrl: string; fileType: string | null; fileSize: number | null }[],
  startSortOrder: number
): Promise<void> {
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    await client.query(
      `INSERT INTO hs_blog_images
         (tenant_id, post_id, file_name, file_url, file_type, file_size, sort_order, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        client.tenantId,
        postId,
        img.fileName,
        img.fileUrl,
        img.fileType,
        img.fileSize,
        startSortOrder + i,
        uploadedBy,
      ]
    );
  }
}

export async function deleteImage(
  client: TenantClient,
  postId: string,
  imageId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM hs_blog_images WHERE tenant_id = $1 AND post_id = $2 AND id = $3`,
    [client.tenantId, postId, imageId]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Posts ──────────────────────────────────────────────────────────────────

interface PostRow {
  id: string;
  body: string;
  body_text: string;
  author_user_id: string;
  created_at: Date;
  updated_at: Date;
  author_name: string | null;
  author_avatar_url: string | null;
  author_designation: string | null;
  comment_count: string;
}

const POST_SELECT = `
  SELECT p.id, p.body, p.body_text, p.author_user_id, p.created_at, p.updated_at,
         u.name       AS author_name,
         u.avatar_url AS author_avatar_url,
         pos.title    AS author_designation,
         (SELECT COUNT(*)::text FROM hs_blog_comments c
           WHERE c.post_id = p.id AND c.tenant_id = p.tenant_id AND c.deleted_at IS NULL
         ) AS comment_count
    FROM hs_blog_posts p
    LEFT JOIN users u ON u.id = p.author_user_id AND u.tenant_id = p.tenant_id::text
    LEFT JOIN positions pos ON pos.id = u.position_id AND pos.tenant_id = u.tenant_id
`;

/** Attach every child collection to a page of post rows, in 3 queries flat. */
async function hydratePosts(
  client: TenantClient,
  rows: PostRow[],
  callerUserId: string
): Promise<BlogPost[]> {
  const ids = rows.map((r) => r.id);
  const [images, mentions, reactions] = await Promise.all([
    imagesFor(client, ids),
    mentionsFor(client, 'post_id', ids),
    reactionsFor(client, 'post_id', ids, callerUserId),
  ]);

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    bodyText: r.body_text ?? '',
    author: mapUser({
      id: r.author_user_id,
      name: r.author_name,
      avatar_url: r.author_avatar_url,
      designation: r.author_designation,
    }),
    images: images.get(r.id) ?? [],
    mentions: mentions.get(r.id) ?? [],
    reactions: reactions.get(r.id) ?? emptySummary(),
    commentCount: Number(r.comment_count ?? 0),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    // Filled in by the service, which knows the caller.
    canEdit: false,
  }));
}

export async function listPosts(
  client: TenantClient,
  query: { search?: string; authorUserId?: string; mentioningMe?: boolean; page: number; pageSize: number },
  callerUserId: string
): Promise<{ rows: BlogPost[]; total: number }> {
  const where: string[] = ['p.tenant_id = $1', 'p.deleted_at IS NULL'];
  const params: any[] = [client.tenantId];

  if (query.search) {
    params.push(`%${query.search}%`);
    // body_text, never body: searching the HTML would match tag names.
    where.push(`p.body_text ILIKE $${params.length}`);
  }
  if (query.authorUserId) {
    params.push(query.authorUserId);
    where.push(`p.author_user_id = $${params.length}`);
  }
  if (query.mentioningMe) {
    params.push(callerUserId);
    where.push(
      `EXISTS (SELECT 1 FROM hs_blog_mentions m
                WHERE m.post_id = p.id AND m.tenant_id = p.tenant_id
                  AND m.user_id = $${params.length})`
    );
  }

  const whereSql = where.join(' AND ');

  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM hs_blog_posts p WHERE ${whereSql}`,
    params
  );
  const total = Number(countRes.rows[0]?.count ?? 0);

  const offset = (query.page - 1) * query.pageSize;
  params.push(query.pageSize, offset);

  const { rows } = await client.query<PostRow>(
    `${POST_SELECT}
      WHERE ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: await hydratePosts(client, rows, callerUserId), total };
}

export async function findPostById(
  client: TenantClient,
  id: string,
  callerUserId: string
): Promise<BlogPost | null> {
  const { rows } = await client.query<PostRow>(
    `${POST_SELECT} WHERE p.tenant_id = $1 AND p.id = $2 AND p.deleted_at IS NULL`,
    [client.tenantId, id]
  );
  if (rows.length === 0) return null;
  const [post] = await hydratePosts(client, rows, callerUserId);
  return post;
}

export async function insertPost(
  client: TenantClient,
  authorUserId: string,
  body: string,
  bodyText: string
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO hs_blog_posts (tenant_id, body, body_text, author_user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [client.tenantId, body, bodyText, authorUserId]
  );
  return rows[0].id;
}

export async function updatePostBody(
  client: TenantClient,
  id: string,
  body: string,
  bodyText: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE hs_blog_posts SET body = $3, body_text = $4, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, body, bodyText]
  );
  return (rowCount ?? 0) > 0;
}

export async function softDeletePost(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE hs_blog_posts SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Comments ───────────────────────────────────────────────────────────────

interface CommentRow {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  body: string;
  author_user_id: string;
  created_at: Date;
  updated_at: Date;
  author_name: string | null;
  author_avatar_url: string | null;
  author_designation: string | null;
}

const COMMENT_SELECT = `
  SELECT c.id, c.post_id, c.parent_comment_id, c.body, c.author_user_id,
         c.created_at, c.updated_at,
         u.name       AS author_name,
         u.avatar_url AS author_avatar_url,
         pos.title    AS author_designation
    FROM hs_blog_comments c
    LEFT JOIN users u ON u.id = c.author_user_id AND u.tenant_id = c.tenant_id::text
    LEFT JOIN positions pos ON pos.id = u.position_id AND pos.tenant_id = u.tenant_id
`;

/**
 * Every live comment on a post, assembled into one level of replies.
 *
 * The whole thread loads at once rather than page-by-page: a reply is
 * meaningless without its parent, and paginating a two-level tree costs more in
 * round trips and edge cases than a post's comment count ever saves.
 */
export async function listComments(
  client: TenantClient,
  postId: string,
  callerUserId: string
): Promise<BlogComment[]> {
  const { rows } = await client.query<CommentRow>(
    `${COMMENT_SELECT}
      WHERE c.tenant_id = $1 AND c.post_id = $2 AND c.deleted_at IS NULL
      ORDER BY c.created_at`,
    [client.tenantId, postId]
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [mentions, reactions] = await Promise.all([
    mentionsFor(client, 'comment_id', ids),
    reactionsFor(client, 'comment_id', ids, callerUserId),
  ]);

  const byId = new Map<string, BlogComment>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      postId: r.post_id,
      parentCommentId: r.parent_comment_id,
      body: r.body,
      author: mapUser({
        id: r.author_user_id,
        name: r.author_name,
        avatar_url: r.author_avatar_url,
        designation: r.author_designation,
      }),
      mentions: mentions.get(r.id) ?? [],
      reactions: reactions.get(r.id) ?? emptySummary(),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      canEdit: false,
      replies: [],
    });
  }

  const roots: BlogComment[] = [];
  for (const comment of byId.values()) {
    const parent = comment.parentCommentId ? byId.get(comment.parentCommentId) : null;
    if (parent) parent.replies.push(comment);
    else roots.push(comment);
  }
  return roots;
}

export async function findCommentById(
  client: TenantClient,
  id: string
): Promise<{ id: string; postId: string; parentCommentId: string | null; authorUserId: string } | null> {
  const { rows } = await client.query<{
    id: string;
    post_id: string;
    parent_comment_id: string | null;
    author_user_id: string;
  }>(
    `SELECT id, post_id, parent_comment_id, author_user_id
       FROM hs_blog_comments
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    parentCommentId: row.parent_comment_id,
    authorUserId: row.author_user_id,
  };
}

export async function insertComment(
  client: TenantClient,
  postId: string,
  parentCommentId: string | null,
  authorUserId: string,
  body: string
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO hs_blog_comments (tenant_id, post_id, parent_comment_id, author_user_id, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [client.tenantId, postId, parentCommentId, authorUserId, body]
  );
  return rows[0].id;
}

export async function updateCommentBody(
  client: TenantClient,
  id: string,
  body: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE hs_blog_comments SET body = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, body]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Soft-delete a comment and every reply under it.
 *
 * Replies go too because a reply whose parent vanished reads as a non sequitur
 * — and the tree builder would silently promote it to a root, which is worse.
 */
export async function softDeleteComment(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE hs_blog_comments SET deleted_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND (id = $2 OR parent_comment_id = $2) AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return (rowCount ?? 0) > 0;
}

/** The post a comment hangs off — needed to authorise a moderator-free delete. */
export async function findPostAuthor(
  client: TenantClient,
  postId: string
): Promise<string | null> {
  const { rows } = await client.query<{ author_user_id: string }>(
    `SELECT author_user_id FROM hs_blog_posts
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, postId]
  );
  return rows[0]?.author_user_id ?? null;
}
