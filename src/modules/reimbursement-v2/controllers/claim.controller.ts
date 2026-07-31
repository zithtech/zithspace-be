// src/modules/reimbursement-v2/controllers/claim.controller.ts
// Thin HTTP layer for self-service claims. Business rules live in the service.
// Receipt uploads: multer (disk) → base64 → R2 → attachment metadata row.

import fs from 'fs';
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/claim.service';
import { ReimbursementV2Error } from '../types';
import {
  addItemSchema,
  attachmentMetaSchema,
  createClaimSchema,
  decisionSchema,
  updateClaimSchema,
  updateItemSchema,
} from '../validators/claim.validator';
import { uploadEmployeeDocumentToR2 } from '@/utils/r2Client';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';


export const validateLimits = handle(async (req: AuthRequest, res: Response) => {
  const input = createClaimSchema.parse(req.body);
  try {
    await service.validateClaimLimitsEndpoint(actorOf(req), input);
    ok(res, { valid: true });
  } catch (err: any) {
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      res.status(err.statusCode).json({ success: false, error: err.message, code: err.code || 'BAD_REQUEST' });
      return;
    }
    throw err;
  }
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createClaimSchema.parse(req.body);
  const claim = await service.createClaim(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT_V2,
    page: Page.REIMBURSEMENT_V2_MY_CLAIMS,
    action: Action.CREATE,
    actionLabel: `Created reimbursement claim ${claim.claimNo}`,
    entityType: EntityType.REIMBURSEMENT_CLAIM,
    entityId: claim.id,
    entityLabel: claim.claimNo,
  });
  ok(res, claim, 201);
});

export const listMine = handle(async (req: AuthRequest, res: Response) => {
  const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
  const claims = await service.listMyClaims(actorOf(req), { status });
  ok(res, claims);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const claim = await service.getMyClaim(actorOf(req), req.params.id);
  ok(res, claim);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateClaimSchema.parse(req.body);
  const claim = await service.updateClaim(actorOf(req), req.params.id, input);
  ok(res, claim);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteClaim(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});

export const addItem = handle(async (req: AuthRequest, res: Response) => {
  const input = addItemSchema.parse(req.body);
  const claim = await service.addItem(actorOf(req), req.params.id, input);
  ok(res, claim, 201);
});

export const updateItem = handle(async (req: AuthRequest, res: Response) => {
  const input = updateItemSchema.parse(req.body);
  const claim = await service.updateItem(actorOf(req), req.params.id, req.params.itemId, input);
  ok(res, claim);
});

export const removeItem = handle(async (req: AuthRequest, res: Response) => {
  const claim = await service.removeItem(actorOf(req), req.params.id, req.params.itemId);
  ok(res, claim);
});

/** Upload one or more receipt files (multipart field "files"). */
export const uploadReceipts = handle(async (req: AuthRequest, res: Response) => {
  const { claimItemId } = attachmentMetaSchema.parse(req.body ?? {});
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    throw ReimbursementV2Error.badRequest('No files provided (multipart field "files")');
  }
  const actor = actorOf(req);

  let claim;
  try {
    for (const file of files) {
      const buffer = fs.readFileSync(file.path);
      const base64 = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
      const fileUrl = await uploadEmployeeDocumentToR2(
        base64,
        file.originalname,
        actor.tenantId,
        actor.userId,
        `reimbursement_v2/${req.params.id}`
      );
      claim = await service.addAttachment(actor, req.params.id, {
        claimItemId: claimItemId ?? null,
        fileName: file.originalname,
        fileUrl,
        fileSize: file.size,
        fileType: file.mimetype,
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
  ok(res, claim, 201);
});

export const removeAttachment = handle(async (req: AuthRequest, res: Response) => {
  const claim = await service.removeAttachment(actorOf(req), req.params.id, req.params.attachmentId);
  ok(res, claim);
});

export const submit = handle(async (req: AuthRequest, res: Response) => {
  let claim;
  try {
    claim = await service.submitClaim(actorOf(req), req.params.id);
  } catch (err: any) {
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      res.status(err.statusCode).json({ success: false, error: err.message, code: err.code || 'BAD_REQUEST' });
      return;
    }
    throw err;
  }
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT_V2,
    page: Page.REIMBURSEMENT_V2_MY_CLAIMS,
    action: Action.SUBMIT,
    actionLabel: `Submitted reimbursement claim ${claim.claimNo} (${claim.status})`,
    entityType: EntityType.REIMBURSEMENT_CLAIM,
    entityId: claim.id,
    entityLabel: claim.claimNo,
  });
  ok(res, claim);
});

export const cancel = handle(async (req: AuthRequest, res: Response) => {
  const { remarks } = decisionSchema.parse(req.body ?? {});
  const claim = await service.cancelClaim(actorOf(req), req.params.id, remarks);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT_V2,
    page: Page.REIMBURSEMENT_V2_MY_CLAIMS,
    action: Action.CANCEL,
    actionLabel: `Cancelled reimbursement claim ${claim.claimNo}`,
    entityType: EntityType.REIMBURSEMENT_CLAIM,
    entityId: claim.id,
    entityLabel: claim.claimNo,
  });
  ok(res, claim);
});
