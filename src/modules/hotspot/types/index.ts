// src/modules/hotspot/types/index.ts
// Shared domain types + module error class for Hotspot.

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
  /** Present when the principal is an employee. */
  employeeId?: string;
  /** True when the caller may moderate anyone's post (pin, edit, delete). */
  canModerate: boolean;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class HotspotError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'HotspotError';
  }

  static notFound(resource: string): HotspotError {
    return new HotspotError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string): HotspotError {
    return new HotspotError(409, 'CONFLICT', message);
  }

  static badRequest(message: string): HotspotError {
    return new HotspotError(400, 'BAD_REQUEST', message);
  }

  static forbidden(message: string): HotspotError {
    return new HotspotError(403, 'FORBIDDEN', message);
  }
}

// ─── Circulation ────────────────────────────────────────────────────────────

/**
 * A category slug stored on a post. Either one of the built-ins below or the
 * `key` of a row in hs_circulation_categories — the service checks membership
 * before every write (migration 002 explains why this is no longer a CHECK).
 */
export type CirculationCategory = string;

export type BuiltInCategory =
  | 'general'
  | 'announcement'
  | 'policy'
  | 'event'
  | 'celebration'
  | 'alert';

/**
 * Shipped with the product, present for every tenant, and NOT deletable —
 * a tenant that removed "policy" would leave older posts pointing at a label
 * nobody can render.
 */
export const BUILT_IN_CATEGORIES: BuiltInCategory[] = [
  'general',
  'announcement',
  'policy',
  'event',
  'celebration',
  'alert',
];

/** Kept for callers that only ever meant the built-in list. */
export const CIRCULATION_CATEGORIES = BUILT_IN_CATEGORIES;

export function isBuiltInCategory(key: string): key is BuiltInCategory {
  return (BUILT_IN_CATEGORIES as string[]).includes(key);
}

/** One entry in the category picker — built-in or tenant-defined. */
export interface CirculationCategoryItem {
  /** Slug stored on posts. */
  key: string;
  label: string;
  /** Built-ins have no row and cannot be renamed or removed. */
  isBuiltIn: boolean;
  /** Row id, for tenant-defined categories only. */
  id: string | null;
  /** Posts currently using it — the UI needs this to explain a blocked delete. */
  postCount: number;
}

/** Mirrors the CHECK constraint on hs_circulation_attachments.kind. */
export type AttachmentKind = 'image' | 'document';

export interface CirculationAttachment {
  id: string;
  postId: string;
  kind: AttachmentKind;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  sortOrder: number;
  uploadedBy: string;
  createdAt: string;
}

export interface CirculationPost {
  id: string;
  title: string;
  body: string;
  bodyText: string;
  category: CirculationCategory;
  /** Display label for a tenant-defined category; null for the built-ins,
   *  whose labels live in the client so they can be localised there. */
  categoryLabel: string | null;
  isPinned: boolean;
  authorUserId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorDesignation: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: CirculationAttachment[];
  /** Derived per-caller: may this principal edit/delete this post? */
  canEdit: boolean;
}

export interface CirculationListQuery {
  search?: string;
  category?: CirculationCategory;
  /** Restrict to the caller's own posts. */
  mineOnly?: boolean;
  /** Restrict to one author. Takes precedence over `mineOnly`. */
  authorUserId?: string;
  page: number;
  pageSize: number;
}

/** One entry in the "posted by" dropdown — only people who have posted. */
export interface CirculationAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
  postCount: number;
}

export interface CirculationListResult {
  items: CirculationPost[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CirculationPostInput {
  title: string;
  body: string;
  bodyText: string;
  category: CirculationCategory;
  isPinned: boolean;
}

export interface NewAttachment {
  kind: AttachmentKind;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
}

// ─── Blogs ──────────────────────────────────────────────────────────────────

/** Mirrors the CHECK constraint on hs_blog_reactions.reaction. */
export type BlogReaction =
  | 'like'
  | 'celebrate'
  | 'support'
  | 'love'
  | 'insightful'
  | 'funny';

export const BLOG_REACTIONS: BlogReaction[] = [
  'like',
  'celebrate',
  'support',
  'love',
  'insightful',
  'funny',
];

export function isBlogReaction(value: string): value is BlogReaction {
  return (BLOG_REACTIONS as string[]).includes(value);
}

/** A colleague, as shown on an author line, a mention chip or the @ picker. */
export interface BlogUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
}

export interface BlogImage {
  id: string;
  postId: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  sortOrder: number;
  createdAt: string;
}

/** Reaction tallies for one post or comment, plus what the caller picked. */
export interface ReactionSummary {
  /** reaction -> count, only for reactions anyone actually used. */
  counts: Partial<Record<BlogReaction, number>>;
  total: number;
  /** The calling user's own reaction, or null. */
  mine: BlogReaction | null;
}

export interface BlogComment {
  id: string;
  postId: string;
  parentCommentId: string | null;
  body: string;
  author: BlogUser;
  mentions: BlogUser[];
  reactions: ReactionSummary;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  /** Direct replies, one level deep. Empty on a reply. */
  replies: BlogComment[];
}

export interface BlogPost {
  id: string;
  /** Sanitised HTML from the composer. */
  body: string;
  /** Plain-text projection — what search and mention matching run against. */
  bodyText: string;
  author: BlogUser;
  images: BlogImage[];
  mentions: BlogUser[];
  reactions: ReactionSummary;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

export interface BlogListQuery {
  search?: string;
  /** Only posts by this user. */
  authorUserId?: string;
  /** Only posts that tag the caller. */
  mentioningMe?: boolean;
  page: number;
  pageSize: number;
}

export interface BlogListResult {
  items: BlogPost[];
  total: number;
  page: number;
  pageSize: number;
}
