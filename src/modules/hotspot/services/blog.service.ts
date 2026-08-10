// src/modules/hotspot/services/blog.service.ts
//
// Business rules for the Blogs feed.
//
// Authorisation model, in one place:
//   read              — every authenticated member of the tenant
//   post / comment    — every authenticated member of the tenant
//   react             — every authenticated member of the tenant
//   edit a post       — its author, or a moderator
//   delete a post     — its author, or a moderator
//   edit a comment    — its author only (a moderator may delete, not rewrite)
//   delete a comment  — its author, the author of the post, or a moderator
//
// A moderator can remove someone's words but cannot put new words in their
// mouth — that asymmetry is why "edit a comment" is author-only while "delete"
// is not.

import { sanitizeHtmlContent, stripHtmlTags } from '@/utils/htmlSanitizer';
import { withTenant, TenantClient } from '../db/pool';
import {
  Actor,
  BlogComment,
  BlogListResult,
  BlogPost,
  BlogReaction,
  BlogUser,
  HotspotError,
} from '../types';
import type {
  BlogListQueryInput,
  CommentInput,
  CreateBlogPostInput,
  MentionSearchInput,
  UpdateBlogPostInput,
  UpdateCommentInput,
} from '../validators/blog.validator';
import * as repo from '../repositories/blog.repo';
import { signManyForViewing } from './fileUrls';

/** Only images belong on a blog post — see migration 003 for why. */
const MAX_IMAGES_PER_POST = 10;

/**
 * Post bodies are HTML from the composer, rendered for the whole tenant — a
 * stored-XSS surface if taken at face value. Sanitising on write (not on
 * render) means every reader is safe regardless of which client displays the
 * post, and a body that reached the table is already clean.
 */
function cleanBody(html: string): string {
  return sanitizeHtmlContent(html ?? '');
}

/**
 * Plain-text projection of a body, for search and for mention matching.
 *
 * Two details that matter:
 *   - blocks are broken apart BEFORE stripping, because sanitize-html removes
 *     tags without replacing them: "…ship it.</p><p>Thanks…" would otherwise
 *     fuse into "ship it.Thanks"
 *   - entities are decoded afterwards, because a name like "Tom & Jerry" is
 *     stored raw in `users.name` but arrives here as "Tom &amp; Jerry". Without
 *     the decode, resolveMentions would refuse to tag them.
 */
function toPlainText(html: string): string {
  const spaced = (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n');

  return stripHtmlTags(spaced)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // &amp; LAST, so "&amp;lt;" does not decode twice into "<".
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Everything a post needs before it leaves the service: the per-caller
 * `canEdit` flag, and image URLs a browser can actually load.
 *
 * The signing lives here rather than in the repository so the repo stays pure
 * SQL — and here rather than at each call site so no return path can forget it
 * and ship a post whose photos 403.
 */
async function finishPost(post: BlogPost, actor: Actor): Promise<BlogPost> {
  const signed = await signManyForViewing(post.images.map((i) => i.fileUrl));
  return {
    ...post,
    canEdit: actor.canModerate || post.author.id === actor.userId,
    images: post.images.map((i) => ({ ...i, fileUrl: signed.get(i.fileUrl) ?? i.fileUrl })),
  };
}

/** Sign a whole page of posts at once. */
async function finishPosts(posts: BlogPost[], actor: Actor): Promise<BlogPost[]> {
  return Promise.all(posts.map((p) => finishPost(p, actor)));
}

/**
 * `canEdit` on a comment means "may rewrite it" — author only. Deleting is
 * broader (see the header) and the client asks separately via `canDelete`
 * semantics it derives from the post author, so this stays narrow on purpose.
 */
function commentWithPermissions(comment: BlogComment, actor: Actor): BlogComment {
  return {
    ...comment,
    canEdit: comment.author.id === actor.userId,
    replies: comment.replies.map((r) => commentWithPermissions(r, actor)),
  };
}

/**
 * Reconcile the mention list the client sent against reality.
 *
 * Two independent checks, and both matter:
 *   1. The user must exist and be active in THIS tenant — otherwise a crafted
 *      request could tag someone from another tenant, or a ghost id.
 *   2. Their display name must actually appear as "@Name" in the body — the
 *      body is what everyone reads, so a mention list that disagrees with it
 *      would notify someone who was never named. The text wins.
 *
 * Anything failing either check is dropped silently rather than erroring: the
 * common cause is an author deleting "@Priya" from the text but the client not
 * clearing its list, and that should just work.
 */
async function resolveMentions(
  client: TenantClient,
  /** The PLAIN-TEXT projection, never the HTML — a name can straddle a tag. */
  bodyText: string,
  requestedIds: string[] | undefined
): Promise<string[]> {
  const ids = [...new Set(requestedIds ?? [])];
  if (ids.length === 0) return [];

  const existing = await repo.filterExistingUserIds(client, ids);
  const live = ids.filter((id) => existing.has(id));
  if (live.length === 0) return [];

  const users = await repo.findUsers(client, live);
  return live.filter((id) => {
    const user = users.get(id);
    if (!user) return false;
    return bodyText.includes(`@${user.name}`);
  });
}

// ─── Posts ──────────────────────────────────────────────────────────────────

export async function list(actor: Actor, query: BlogListQueryInput): Promise<BlogListResult> {
  return withTenant(actor.tenantId, async (client) => {
    const { rows, total } = await repo.listPosts(
      client,
      {
        search: query.search,
        authorUserId: query.authorUserId,
        mentioningMe: query.mentioningMe,
        page: query.page,
        pageSize: query.pageSize,
      },
      actor.userId
    );
    return {
      items: await finishPosts(rows, actor),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });
}

export async function getOne(actor: Actor, id: string): Promise<BlogPost> {
  return withTenant(actor.tenantId, async (client) => {
    const post = await repo.findPostById(client, id, actor.userId);
    if (!post) throw HotspotError.notFound('Post');
    return finishPost(post, actor);
  });
}

export async function create(actor: Actor, input: CreateBlogPostInput): Promise<BlogPost> {
  const body = cleanBody(input.body);
  // Derived from the SANITISED html, so search and mentions can never claim
  // text the stored post does not contain.
  const bodyText = toPlainText(body);

  return withTenant(actor.tenantId, async (client) => {
    const id = await repo.insertPost(client, actor.userId, body, bodyText);

    const mentions = await resolveMentions(client, bodyText, input.mentionUserIds);
    if (mentions.length) await repo.setMentions(client, { postId: id }, mentions);

    const post = await repo.findPostById(client, id, actor.userId);
    if (!post) throw HotspotError.notFound('Post');
    return finishPost(post, actor);
  });
}

export async function update(
  actor: Actor,
  id: string,
  input: UpdateBlogPostInput
): Promise<BlogPost> {
  const body = cleanBody(input.body);
  const bodyText = toPlainText(body);

  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, id, actor.userId);
    if (!existing) throw HotspotError.notFound('Post');
    assertCanWritePost(actor, existing);

    if (!bodyText && existing.images.length === 0) {
      throw HotspotError.badRequest('A post needs text or an image');
    }

    await repo.updatePostBody(client, id, body, bodyText);
    await repo.setMentions(
      client,
      { postId: id },
      await resolveMentions(client, bodyText, input.mentionUserIds)
    );

    const post = await repo.findPostById(client, id, actor.userId);
    if (!post) throw HotspotError.notFound('Post');
    return finishPost(post, actor);
  });
}

export async function remove(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, id, actor.userId);
    if (!existing) throw HotspotError.notFound('Post');
    assertCanWritePost(actor, existing);
    await repo.softDeletePost(client, id);
  });
}

/**
 * Attach already-uploaded images. The controller does the R2 upload — this only
 * records the metadata, inside the same tenant transaction.
 */
export async function addImages(
  actor: Actor,
  id: string,
  images: { fileName: string; fileUrl: string; fileType: string | null; fileSize: number | null }[]
): Promise<BlogPost> {
  if (images.length === 0) throw HotspotError.badRequest('No images provided');

  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, id, actor.userId);
    if (!existing) throw HotspotError.notFound('Post');
    assertCanWritePost(actor, existing);

    if (existing.images.length + images.length > MAX_IMAGES_PER_POST) {
      throw HotspotError.badRequest(`A post can hold at most ${MAX_IMAGES_PER_POST} images`);
    }

    const start = await repo.nextImageSortOrder(client, id);
    await repo.insertImages(client, id, actor.userId, images, start);

    const post = await repo.findPostById(client, id, actor.userId);
    if (!post) throw HotspotError.notFound('Post');
    return finishPost(post, actor);
  });
}

export async function removeImage(
  actor: Actor,
  id: string,
  imageId: string
): Promise<BlogPost> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, id, actor.userId);
    if (!existing) throw HotspotError.notFound('Post');
    assertCanWritePost(actor, existing);

    // Removing the last image from a text-free post would leave a blank card in
    // everyone's feed. Say so instead of creating one.
    if (!existing.bodyText.trim() && existing.images.length <= 1) {
      throw HotspotError.badRequest(
        'This post has no text — add some before removing its last image, or delete the post'
      );
    }

    const removed = await repo.deleteImage(client, id, imageId);
    if (!removed) throw HotspotError.notFound('Image');

    const post = await repo.findPostById(client, id, actor.userId);
    if (!post) throw HotspotError.notFound('Post');
    return finishPost(post, actor);
  });
}

// ─── Reactions ──────────────────────────────────────────────────────────────

export async function reactToPost(
  actor: Actor,
  postId: string,
  reaction: BlogReaction
): Promise<BlogPost> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPostById(client, postId, actor.userId);
    if (!existing) throw HotspotError.notFound('Post');

    // Tapping the reaction you already picked clears it, the way every feed
    // behaves — otherwise there is no way to take a reaction back. `existing`
    // already carries the caller's own reaction, so no extra query here.
    if (existing.reactions.mine === reaction) {
      await repo.deleteReaction(client, { postId }, actor.userId);
    } else {
      await repo.upsertReaction(client, { postId }, actor.userId, reaction);
    }

    const post = await repo.findPostById(client, postId, actor.userId);
    if (!post) throw HotspotError.notFound('Post');
    return finishPost(post, actor);
  });
}

export async function clearPostReaction(actor: Actor, postId: string): Promise<BlogPost> {
  return withTenant(actor.tenantId, async (client) => {
    await repo.deleteReaction(client, { postId }, actor.userId);
    const post = await repo.findPostById(client, postId, actor.userId);
    if (!post) throw HotspotError.notFound('Post');
    return finishPost(post, actor);
  });
}

export async function reactToComment(
  actor: Actor,
  commentId: string,
  reaction: BlogReaction
): Promise<BlogComment[]> {
  return withTenant(actor.tenantId, async (client) => {
    const comment = await repo.findCommentById(client, commentId);
    if (!comment) throw HotspotError.notFound('Comment');

    // Same toggle rule as posts: tapping the reaction you already have clears it.
    const current = await repo.findMyReaction(client, { commentId }, actor.userId);
    if (current === reaction) {
      await repo.deleteReaction(client, { commentId }, actor.userId);
    } else {
      await repo.upsertReaction(client, { commentId }, actor.userId, reaction);
    }

    const next = await repo.listComments(client, comment.postId, actor.userId);
    return next.map((c) => commentWithPermissions(c, actor));
  });
}

/** Who reacted, for the "reacted by" popover. */
export async function listPostReactors(
  actor: Actor,
  postId: string,
  limit = 50
): Promise<{ user: BlogUser; reaction: BlogReaction }[]> {
  return withTenant(actor.tenantId, (client) =>
    repo.listReactors(client, { postId }, limit)
  );
}

// ─── Comments ───────────────────────────────────────────────────────────────

export async function listComments(actor: Actor, postId: string): Promise<BlogComment[]> {
  return withTenant(actor.tenantId, async (client) => {
    const thread = await repo.listComments(client, postId, actor.userId);
    return thread.map((c) => commentWithPermissions(c, actor));
  });
}

export async function addComment(
  actor: Actor,
  postId: string,
  input: CommentInput
): Promise<BlogComment[]> {
  const body = input.body.trim();

  return withTenant(actor.tenantId, async (client) => {
    const postAuthor = await repo.findPostAuthor(client, postId);
    if (!postAuthor) throw HotspotError.notFound('Post');

    let parentId: string | null = null;
    if (input.parentCommentId) {
      const parent = await repo.findCommentById(client, input.parentCommentId);
      if (!parent || parent.postId !== postId) throw HotspotError.notFound('Comment');
      // One level only: replying to a reply attaches to ITS parent instead of
      // growing a third level the UI cannot render.
      parentId = parent.parentCommentId ?? parent.id;
    }

    const id = await repo.insertComment(client, postId, parentId, actor.userId, body);

    // Comment bodies are plain text, so the body IS its own projection.
    const mentions = await resolveMentions(client, body, input.mentionUserIds);
    if (mentions.length) await repo.setMentions(client, { commentId: id }, mentions);

    const thread = await repo.listComments(client, postId, actor.userId);
    return thread.map((c) => commentWithPermissions(c, actor));
  });
}

export async function updateComment(
  actor: Actor,
  commentId: string,
  input: UpdateCommentInput
): Promise<BlogComment[]> {
  const body = input.body.trim();

  return withTenant(actor.tenantId, async (client) => {
    const comment = await repo.findCommentById(client, commentId);
    if (!comment) throw HotspotError.notFound('Comment');
    // Author only — a moderator may delete a comment but never rewrite it.
    if (comment.authorUserId !== actor.userId) {
      throw HotspotError.forbidden('You can only edit your own comments');
    }

    await repo.updateCommentBody(client, commentId, body);
    await repo.setMentions(
      client,
      { commentId },
      await resolveMentions(client, body, input.mentionUserIds)
    );

    const thread = await repo.listComments(client, comment.postId, actor.userId);
    return thread.map((c) => commentWithPermissions(c, actor));
  });
}

export async function removeComment(actor: Actor, commentId: string): Promise<BlogComment[]> {
  return withTenant(actor.tenantId, async (client) => {
    const comment = await repo.findCommentById(client, commentId);
    if (!comment) throw HotspotError.notFound('Comment');

    const postAuthor = await repo.findPostAuthor(client, comment.postId);
    const allowed =
      actor.canModerate ||
      comment.authorUserId === actor.userId ||
      // The author of a post moderates the conversation under it.
      postAuthor === actor.userId;
    if (!allowed) {
      throw HotspotError.forbidden('You can only remove your own comments');
    }

    await repo.softDeleteComment(client, commentId);

    const thread = await repo.listComments(client, comment.postId, actor.userId);
    return thread.map((c) => commentWithPermissions(c, actor));
  });
}

// ─── Mention picker ─────────────────────────────────────────────────────────

export async function searchMentionableUsers(
  actor: Actor,
  input: MentionSearchInput
): Promise<BlogUser[]> {
  return withTenant(actor.tenantId, (client) =>
    repo.searchMentionableUsers(client, input.search, input.limit)
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function assertCanWritePost(actor: Actor, post: BlogPost): void {
  if (actor.canModerate) return;
  if (post.author.id === actor.userId) return;
  throw HotspotError.forbidden('You can only edit or remove your own posts');
}
