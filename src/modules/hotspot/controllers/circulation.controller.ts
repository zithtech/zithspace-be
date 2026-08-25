// src/modules/hotspot/controllers/circulation.controller.ts
//
// Thin HTTP layer for the Circulation noticeboard. Every handler parses its
// input with a zod schema, delegates to the service and returns the platform
// `{ success, data }` envelope via ok().
//
// Attachments: multer (disk) → base64 → R2 → metadata row, matching the
// reimbursement-v2 receipt flow. Temp files are always unlinked, including when
// an upload fails midway.

import fs from 'fs';
import { Response } from 'express';
import { AuthRequest } from '@/types';
import { uploadEmployeeDocumentToR2 } from '@/utils/r2Client';
import { actorOf, handle, ok } from '../http';
import { HotspotError, NewAttachment } from '../types';
import {
  createCategorySchema,
  createPostSchema,
  listQuerySchema,
  pinSchema,
  updatePostSchema,
} from '../validators/circulation.validator';
import * as service from '../services/circulation.service';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

/** Images render inline in the post gallery; everything else is a download. */
function kindOf(mimeType: string): NewAttachment['kind'] {
  return mimeType.startsWith('image/') ? 'image' : 'document';
}

export const list = handle(async (req: AuthRequest, res: Response) => {
  const query = listQuerySchema.parse(req.query ?? {});
  ok(res, await service.list(actorOf(req), query));
});

/** The "posted by" dropdown: people who have actually circulated something. */
export const listAuthors = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listAuthors(actorOf(req)));
});

/** The picker catalog: built-ins plus this tenant's own categories. */
export const listCategories = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listCategories(actorOf(req)));
});

export const createCategory = handle(async (req: AuthRequest, res: Response) => {
  const input = createCategorySchema.parse(req.body ?? {});
  ok(res, await service.createCategory(actorOf(req), input), 201);
});

export const removeCategory = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteCategory(actorOf(req), req.params.categoryId);
  ok(res, { id: req.params.categoryId });
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
    page: Page.CIRCULATION,
    action: Action.CREATE,
    entityType: EntityType.CIRCULATION,
    entityId: result.id,
    entityLabel: input.title ?? 'Circulation Post',
  });
  ok(res, result, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const patch = updatePostSchema.parse(req.body ?? {});
  const result = await service.update(actorOf(req), req.params.id, patch);
  recordTransaction({
    req,
    section: Section.HOME,
    module: Module.HOTSPOT,
    page: Page.CIRCULATION,
    action: Action.UPDATE,
    entityType: EntityType.CIRCULATION,
    entityId: req.params.id,
    entityLabel: patch.title ?? 'Circulation Post',
  });
  ok(res, result);
});

export const setPinned = handle(async (req: AuthRequest, res: Response) => {
  const { isPinned } = pinSchema.parse(req.body ?? {});
  ok(res, await service.setPinned(actorOf(req), req.params.id, isPinned));
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.remove(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.HOME,
    module: Module.HOTSPOT,
    page: Page.CIRCULATION,
    action: Action.DELETE,
    entityType: EntityType.CIRCULATION,
    entityId: req.params.id,
    entityLabel: 'Circulation Post',
  });
  ok(res, { id: req.params.id });
});

export const uploadAttachments = handle(async (req: AuthRequest, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    throw HotspotError.badRequest('No files provided (multipart field "files")');
  }
  const actor = actorOf(req);

  const uploaded: NewAttachment[] = [];
  try {
    for (const file of files) {
      const buffer = fs.readFileSync(file.path);
      const base64 = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
      const fileUrl = await uploadEmployeeDocumentToR2(
        base64,
        file.originalname,
        actor.tenantId,
        actor.userId,
        `hotspot_circulation/${req.params.id}`
      );
      uploaded.push({
        kind: kindOf(file.mimetype),
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

  ok(res, await service.addAttachments(actor, req.params.id, uploaded), 201);
});

export const removeAttachment = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.removeAttachment(actorOf(req), req.params.id, req.params.attachmentId));
});
