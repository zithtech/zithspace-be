// src/modules/hotspot/validators/circulation.validator.ts
// Request shapes for the Circulation noticeboard. Everything crossing the HTTP
// boundary is parsed here so services and repositories can trust their inputs.

import { z } from 'zod';

/**
 * A category slug. The set of ALLOWED slugs is per-tenant (built-ins plus the
 * tenant's own), so membership is checked in the service — this only enforces
 * the shape a slug may take.
 */
const categoryEnum = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/, 'Category must be a lowercase slug');

/** Query strings arrive as strings; coerce the ones that are not. */
const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

export const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: categoryEnum.optional(),
  mineOnly: boolish.optional(),
  authorUserId: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// The body is HTML from the composer. It is capped rather than stripped here —
// the client sanitises on render, and a server-side strip would silently eat
// legitimate formatting.
const bodySchema = z.string().max(50_000);

// `bodyText` is deliberately NOT accepted from the client: the service derives
// the search projection from the sanitised body, so a caller cannot make a post
// findable by text that is not in it.
export const createPostSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(250),
  body: bodySchema.default(''),
  category: categoryEnum.default('general'),
  isPinned: z.boolean().default(false),
});

export const updatePostSchema = z
  .object({
    title: z.string().trim().min(1).max(250),
    body: bodySchema,
    category: categoryEnum,
    isPinned: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const pinSchema = z.object({
  isPinned: z.boolean(),
});

/**
 * A new tenant-defined category. Only the human label is supplied — the slug is
 * derived server-side, so two people typing "Town hall" and "Town Hall" can
 * never end up with two categories.
 */
export const createCategorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'Give the category a name')
    .max(40, 'Keep the category name under 40 characters')
    // Letters, numbers, spaces and a few separators. Anything else would slug
    // down to nothing or collide with an unrelated name.
    .regex(/^[\p{L}\p{N} ()&/'.-]+$/u, 'Use letters, numbers and spaces only')
    .refine((v) => /[\p{L}\p{N}]/u.test(v), 'Give the category a name'),
});

export type ListQueryInput = z.infer<typeof listQuerySchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
