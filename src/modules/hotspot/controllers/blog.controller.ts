// src/modules/hotspot/controllers/blog.controller.ts
//
// Thin HTTP layer for the Blogs feed. Every handler parses its input with a zod
// schema, delegates to the service and returns the platform `{ success, data }`
// envelope via ok().
//
// Images: multer (disk) → base64 → R2 → metadata row, matching the
// reimbursement-v2 receipt flow. Temp files are always unlinked, including when
// an upload fails midway.

import fs from 'fs';
import { Response } from 'express';
import { AuthRequest } from '@/types';
import { uploadEmployeeDocumentToR2 } from '@/utils/r2Client';
import { actorOf, handle, ok } from '../http';
import { BlogReaction, HotspotError } from '../types';
import {
  commentSchema,
  createPostSchema,
  listQuerySchema,
  mentionSearchSchema,
  reactionSchema,
  updateCommentSchema,
  updatePostSchema,
} from '../validators/blog.validator';
import * as service from '../services/blog.service';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const query = listQuerySchema.parse(req.query ?? {});
  ok(res, await service.list(actorOf(req), query));
});

/** The @ picker: colleagues in the tenant, name-matched. */
export const mentionableUsers = handle(async (req: AuthRequest, res: Response) => {
  const input = mentionSearchSchema.parse(req.query ?? {});
  ok(res, await service.searchMentionableUsers(actorOf(req), input));
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getOne(actorOf(req), req.params.id));
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createPostSchema.parse(req.body ?? {});
  const result = await service.create(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.HOME,
    module: Module.HOTSPOT,
    page: Page.BLOGS,
    action: Action.CREATE,
    entityType: EntityType.BLOG,
    entityId: result.id,
    entityLabel: 'Blog Post',
  });
  ok(res, result, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updatePostSchema.parse(req.body ?? {});
  const result = await service.update(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.HOME,
    module: Module.HOTSPOT,
    page: Page.BLOGS,
    action: Action.UPDATE,
    entityType: EntityType.BLOG,
    entityId: req.params.id,
    entityLabel: 'Blog Post',
  });
  ok(res, result);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.remove(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.HOME,
    module: Module.HOTSPOT,
    page: Page.BLOGS,
    action: Action.DELETE,
    entityType: EntityType.BLOG,
    entityId: req.params.id,
    entityLabel: 'Blog Post',
  });
  ok(res, { id: req.params.id });
});

export const uploadImages = handle(async (req: AuthRequest, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    throw HotspotError.badRequest('No images provided (multipart field "files")');
  }
  // Only images belong on a blog post — a document here would render as a
  // broken tile rather than a download.
  const rejected = files.find((f) => !f.mimetype.startsWith('image/'));
  if (rejected) {
    for (const file of files) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
    throw HotspotError.badRequest(`${rejected.originalname} is not an image`);
  }

  const actor = actorOf(req);
  const uploaded: {
    fileName: string;
    fileUrl: string;
    fileType: string | null;
    fileSize: number | null;
  }[] = [];

  try {
    for (const file of files) {
      const buffer = fs.readFileSync(file.path);
      const base64 = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
      const fileUrl = await uploadEmployeeDocumentToR2(
        base64,
        file.originalname,
        actor.tenantId,
        actor.userId,
        `hotspot_blogs/${req.params.id}`
      );
      uploaded.push({
        fileName: file.originalname,
        fileUrl,
        fileType: file.mimetype,
        fileSize: file.size,
      });
    }
  } finally {
    // Always clean up temp files, even if an upload failed midway.
    for (const file of files) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  }

  ok(res, await service.addImages(actor, req.params.id, uploaded), 201);
});

export const removeImage = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.removeImage(actorOf(req), req.params.id, req.params.imageId));
});

// ─── Reactions ──────────────────────────────────────────────────────────────

export const reactToPost = handle(async (req: AuthRequest, res: Response) => {
  const { reaction } = reactionSchema.parse(req.body ?? {});
  ok(res, await service.reactToPost(actorOf(req), req.params.id, reaction as BlogReaction));
});

export const clearPostReaction = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.clearPostReaction(actorOf(req), req.params.id));
});

export const postReactors = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listPostReactors(actorOf(req), req.params.id));
});

export const reactToComment = handle(async (req: AuthRequest, res: Response) => {
  const { reaction } = reactionSchema.parse(req.body ?? {});
  ok(
    res,
    await service.reactToComment(actorOf(req), req.params.commentId, reaction as BlogReaction)
  );
});

// ─── Comments ───────────────────────────────────────────────────────────────

export const listComments = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listComments(actorOf(req), req.params.id));
});

export const addComment = handle(async (req: AuthRequest, res: Response) => {
  const input = commentSchema.parse(req.body ?? {});
  ok(res, await service.addComment(actorOf(req), req.params.id, input), 201);
});

export const updateComment = handle(async (req: AuthRequest, res: Response) => {
  const input = updateCommentSchema.parse(req.body ?? {});
  ok(res, await service.updateComment(actorOf(req), req.params.commentId, input));
});

export const removeComment = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.removeComment(actorOf(req), req.params.commentId));
});
