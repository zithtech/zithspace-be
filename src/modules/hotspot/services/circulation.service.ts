// src/modules/hotspot/services/circulation.service.ts
//
// Business rules for the Circulation noticeboard.
//
// Authorisation model, in one place:
//   read    — every authenticated member of the tenant
//   create  — every authenticated member of the tenant
//   update  — the author, or a moderator
//   delete  — the author, or a moderator
//   pin     — moderators only (pinning is a tenant-wide claim on attention)

import { sanitizeHtmlContent, stripHtmlTags } from '@/utils/htmlSanitizer';
import { TenantClient, withTenant } from '../db/pool';
import {
  Actor,
  BUILT_IN_CATEGORIES,
  CirculationAuthor,
  CirculationCategoryItem,
  CirculationListResult,
  CirculationPost,
  HotspotError,
  NewAttachment,
  isBuiltInCategory,
} from '../types';
import type {
  CreateCategoryInput,
  CreatePostInput,
  ListQueryInput,
  UpdatePostInput,
} from '../validators/circulation.validator';
import * as repo from '../repositories/circulation.repo';
import { signManyForViewing } from './fileUrls';

/**
 * The body is HTML authored in a rich-text editor and then rendered for the
 * whole tenant — a stored-XSS surface if taken at face value. Sanitising on
 * write (not on render) means every reader is safe regardless of which client
 * displays the post, and means a body that reached the table is already clean.
 */
function cleanBody(html: string): string {
  return sanitizeHtmlContent(html ?? '');
}

/**
 * Plain-text projection of the body, used for search and the feed preview.
 * Done here rather than in the client so an older client that omits bodyText
 * still gets a searchable post.
 */
function toPlainText(html: string): string {
  // Break blocks apart BEFORE stripping — sanitize-html removes tags without
  // replacing them, so "…done.</p><p>Next…" would otherwise fuse into one word.
  const spaced = (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n');

  return stripHtmlTags(spaced)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Everything a post needs before it leaves the service: the per-caller
 * `canEdit` flag, and attachment URLs a browser can actually load. See
 * ./fileUrls.ts for why the stored URL is not directly usable.
 */
async function withPermissions(post: CirculationPost, actor: Actor): Promise<CirculationPost> {
  const signed = await signManyForViewing(post.attachments.map((a) => a.fileUrl));
  return {
    ...post,
    canEdit: actor.canModerate || post.authorUserId === actor.userId,
    attachments: post.attachments.map((a) => ({
      ...a,
      fileUrl: signed.get(a.fileUrl) ?? a.fileUrl,
    })),
  };
}

// ─── Categories ─────────────────────────────────────────────────────────────

/**
 * Slug a human label. Lowercase, non-alphanumerics collapsed to underscores —
 * so "Town Hall" and "town  hall!" resolve to the same category rather than two.
 */
export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Reject a category the tenant does not have.
 *
 * Migration 002 dropped the CHECK constraint because a constraint cannot see a
 * per-tenant catalog. This is what replaced it, and every write path must go
 * through it — otherwise a caller could post into a category that renders as a
 * raw slug for the whole company.
 */
async function assertCategoryExists(client: TenantClient, key: string): Promise<void> {
  if (isBuiltInCategory(key)) return;
  const custom = await repo.listCustomCategories(client);
  if (custom.some((c) => c.key === key)) return;
  throw HotspotError.badRequest('That category does not exist');
}

/** People who have circulated something, for the "posted by" dropdown. */
export async function listAuthors(actor: Actor): Promise<CirculationAuthor[]> {
  return withTenant(actor.tenantId, (client) => repo.listAuthors(client));
}

/** Built-ins plus the tenant's own, each with its live post count. */
export async function listCategories(actor: Actor): Promise<CirculationCategoryItem[]> {
  return withTenant(actor.tenantId, async (client) => {
    const [custom, counts] = await Promise.all([
      repo.listCustomCategories(client),
      repo.countByCategory(client),
    ]);

    const builtIns: CirculationCategoryItem[] = BUILT_IN_CATEGORIES.map((key) => ({
      key,
      // Built-in labels live in the client so they can be localised there.
      label: key,
      isBuiltIn: true,
      id: null,
      postCount: counts[key] ?? 0,
    }));

    return [
      ...builtIns,
      ...custom.map((c) => ({ ...c, postCount: counts[c.key] ?? 0 })),
    ];
  });
}

/**
 * Add a tenant-defined category.
 *
 * Anyone who may post may add one: a category the poster cannot create is a
 * category they will not use, and the alternative is people filing a "Town
 * hall" notice under "General" forever. Duplicates resolve to the existing
 * category rather than erroring — someone typing a name that already exists
 * wants that category, not a failure message.
 */
export async function createCategory(
  actor: Actor,
  input: CreateCategoryInput
): Promise<CirculationCategoryItem> {
  const label = input.label.trim();
  const key = slugify(label);

  if (!key) {
    throw HotspotError.badRequest('Give the category a name with letters or numbers in it');
  }
  if (isBuiltInCategory(key)) {
    throw HotspotError.conflict(`“${label}” is already a built-in category`);
  }

  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findCategoryByKeyOrLabel(client, key, label);
    if (existing) {
      const counts = await repo.countByCategory(client);
      return {
        id: existing.id,
        key: existing.key,
        label: existing.label,
        isBuiltIn: false,
        postCount: counts[existing.key] ?? 0,
      };
    }

    const created = await repo.insertCategory(client, actor.userId, key, label);
    return {
      id: created.id,
      key: created.key,
      label: created.label,
      isBuiltIn: false,
      postCount: 0,
    };
  });
}

/**
 * Remove a tenant-defined category.
 *
 * Moderators only, and only while nothing uses it. Deleting a category out from
 * under live posts would leave them rendering a raw slug — so the count is the
 * gate, and the error says exactly how many posts are in the way.
 */
export async function deleteCategory(actor: Actor, id: string): Promise<void> {
  if (!actor.canModerate) {
    throw HotspotError.forbidden('Only a Hotspot moderator can remove a category');
  }

  return withTenant(actor.tenantId, async (client) => {
    const category = await repo.findCategoryById(client, id);
    if (!category) throw HotspotError.notFound('Category');

    const inUse = await repo.countPostsInCategory(client, category.key);
    if (inUse > 0) {
      throw HotspotError.conflict(
        `“${category.label}” is used by ${inUse} post${inUse === 1 ? '' : 's'} — move them first`
      );
    }

    await repo.deleteCategory(client, id);
  });
}

export async function list(actor: Actor, query: ListQueryInput): Promise<CirculationListResult> {
  return withTenant(actor.tenantId, async (client) => {
    const { rows, total } = await repo.listPosts(
      client,
      {
        search: query.search,
        category: query.category as any,
        mineOnly: query.mineOnly,
        authorUserId: query.authorUserId,
        page: query.page,
        pageSize: query.pageSize,
      },
      actor.userId
    );
    return {
      items: await Promise.all(rows.map((p) => withPermissions(p, actor))),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });
}

export async function getOne(actor: Actor, id: string): Promise<CirculationPost> {
  return withTenant(actor.tenantId, async (client) => {
    const post = await repo.findPostById(client, id);
    if (!post) throw HotspotError.notFound('Circulation post');
    return withPermissions(post, actor);
  });
}

export async function create(actor: Actor, input: CreatePostInput): Promise<CirculationPost> {
  // Pinning is a moderator act; a non-moderator asking for it just posts normally.
  const isPinned = input.isPinned && actor.canModerate;

  const body = cleanBody(input.body);

  return withTenant(actor.tenantId, async (client) => {
    await assertCategoryExists(client, input.category);

    const id = await repo.insertPost(client, actor.userId, {
      title: input.title,
      body,
      // Derived from the SANITISED body, so search can never match markup that
      // was stripped on the way in.
      bodyText: toPlainText(body),
      category: input.category as any,
      isPinned,
    });
    const post = await repo.findPostById(client, id);
    if (!post) throw HotspotError.notFound('Circulation post');
    return withPermissions(post, actor);
  });
}

export async function update(
  actor: Actor,
  id: string,
  patch: UpdatePostInput
): Promise<CirculationPost> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, id);
    if (!existing) throw HotspotError.notFound('Circulation post');
    assertCanWrite(actor, existing);

    if (patch.isPinned !== undefined && !actor.canModerate) {
      throw HotspotError.forbidden('Only a Hotspot moderator can pin or unpin a post');
    }
    if (patch.category !== undefined) {
      await assertCategoryExists(client, patch.category);
    }

    // Keep the search projection in step with the body on every edit, and
    // derive it from the sanitised HTML rather than what the client sent.
    const body = patch.body !== undefined ? cleanBody(patch.body) : undefined;
    const bodyText = body !== undefined ? toPlainText(body) : undefined;

    await repo.updatePost(client, id, {
      title: patch.title,
      body,
      bodyText,
      category: patch.category as any,
      isPinned: patch.isPinned,
    });

    const post = await repo.findPostById(client, id);
    if (!post) throw HotspotError.notFound('Circulation post');
    return withPermissions(post, actor);
  });
}

export async function setPinned(
  actor: Actor,
  id: string,
  isPinned: boolean
): Promise<CirculationPost> {
  if (!actor.canModerate) {
    throw HotspotError.forbidden('Only a Hotspot moderator can pin or unpin a post');
  }
  return withTenant(actor.tenantId, async (client) => {
    const updated = await repo.updatePost(client, id, { isPinned });
    if (!updated) throw HotspotError.notFound('Circulation post');
    const post = await repo.findPostById(client, id);
    if (!post) throw HotspotError.notFound('Circulation post');
    return withPermissions(post, actor);
  });
}

export async function remove(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, id);
    if (!existing) throw HotspotError.notFound('Circulation post');
    assertCanWrite(actor, existing);
    await repo.softDeletePost(client, id);
  });
}

/**
 * Attach already-uploaded files to a post. The controller does the R2 upload —
 * this only records the metadata, inside the same tenant transaction.
 */
export async function addAttachments(
  actor: Actor,
  id: string,
  files: NewAttachment[]
): Promise<CirculationPost> {
  if (files.length === 0) throw HotspotError.badRequest('No files provided');

  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, id);
    if (!existing) throw HotspotError.notFound('Circulation post');
    assertCanWrite(actor, existing);

    const start = await repo.nextAttachmentSortOrder(client, id);
    await repo.insertAttachments(client, id, actor.userId, files, start);

    const post = await repo.findPostById(client, id);
    if (!post) throw HotspotError.notFound('Circulation post');
    return withPermissions(post, actor);
  });
}

export async function removeAttachment(
  actor: Actor,
  id: string,
  attachmentId: string
): Promise<CirculationPost> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, id);
    if (!existing) throw HotspotError.notFound('Circulation post');
    assertCanWrite(actor, existing);

    const removed = await repo.deleteAttachment(client, id, attachmentId);
    if (!removed) throw HotspotError.notFound('Attachment');

    const post = await repo.findPostById(client, id);
    if (!post) throw HotspotError.notFound('Circulation post');
    return withPermissions(post, actor);
  });
}

function assertCanWrite(actor: Actor, post: CirculationPost): void {
  if (actor.canModerate) return;
  if (post.authorUserId === actor.userId) return;
  throw HotspotError.forbidden('You can only edit or remove your own circulation posts');
}
