// src/modules/hotspot/validators/blog.validator.ts
// Request shapes for the Blogs feed. Everything crossing the HTTP boundary is
// parsed here so services and repositories can trust their inputs.

import { z } from 'zod';
import { BLOG_REACTIONS } from '../types';

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

/**
 * A post body: HTML from the rich-text composer, sanitised in the service.
 * Bounded so one person cannot paste a novel into a feed everyone loads.
 *
 * Comment bodies stay plain text — a comment box is not a document editor.
 */
const postBody = z.string().max(50_000);

/** Does this HTML carry any visible text? `<p></p>` from an empty editor does not. */
function hasVisibleText(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0;
}

/**
 * Tagged colleagues, by user id. The service still checks that each one is a
 * real user in the tenant AND is actually named in the body — a mention list
 * that disagrees with the text is a notification nobody asked for.
 */
const mentionIds = z.array(z.string().trim().min(1).max(64)).max(30).optional();

export const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  authorUserId: z.string().trim().max(64).optional(),
  mentioningMe: boolish.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const createPostSchema = z
  .object({
    body: postBody.default(''),
    mentionUserIds: mentionIds,
  })
  // Images arrive on a separate multipart call, so a post created with neither
  // text nor a pending upload would be an empty card in everyone's feed. The
  // client sends `hasImages` when it is about to upload.
  .extend({ hasImages: z.boolean().optional() })
  .refine((v) => hasVisibleText(v.body) || v.hasImages, {
    message: 'Write something or add an image',
    path: ['body'],
  });

export const updatePostSchema = z.object({
  body: postBody,
  mentionUserIds: mentionIds,
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(4_000),
  /** Set to reply to a top-level comment. Replies cannot be replied to. */
  parentCommentId: z.string().uuid().optional().nullable(),
  mentionUserIds: mentionIds,
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(4_000),
  mentionUserIds: mentionIds,
});

export const reactionSchema = z.object({
  reaction: z.enum(BLOG_REACTIONS as [string, ...string[]]),
});

export const mentionSearchSchema = z.object({
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

export type BlogListQueryInput = z.infer<typeof listQuerySchema>;
export type CreateBlogPostInput = z.infer<typeof createPostSchema>;
export type UpdateBlogPostInput = z.infer<typeof updatePostSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type MentionSearchInput = z.infer<typeof mentionSearchSchema>;
