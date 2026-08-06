// src/modules/opening-management/controllers/posting.controller.ts
// Thin HTTP layer for the Phase 4 posting lifecycle.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/posting.service';
import {
  closePostingSchema,
  postExternalSchema,
  postInternalSchema,
  updatePostingSettingsSchema,
} from '../validators/posting.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

// ─── Settings ───────────────────────────────────────────────────────────────

export const getSettings = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getSettings(actorOf(req)));
});

export const updateSettings = handle(async (req: AuthRequest, res: Response) => {
  const input = updatePostingSettingsSchema.parse(req.body);
  const settings = await service.updateSettings(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_POSTINGS,
    action: Action.UPDATE,
    actionLabel:
      `Updated posting settings — internal window ${settings.internalPostingDays} day(s), ` +
      `auto-move ${settings.autoMoveToExternal ? 'on' : 'off'}`,
    entityType: EntityType.OPENING_POSTING,
    entityId: settings.tenantId,
    afterData: {
      internalPostingDays: settings.internalPostingDays,
      autoMoveToExternal: settings.autoMoveToExternal,
    },
  });
  ok(res, settings);
});

// ─── Postings ───────────────────────────────────────────────────────────────

export const list = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listPostings(actorOf(req), req.params.id));
});

export const postInternal = handle(async (req: AuthRequest, res: Response) => {
  const input = postInternalSchema.parse(req.body ?? {});
  const result = await service.postInternally(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_POSTINGS,
    action: Action.STATUS_CHANGE,
    actionLabel:
      `Posted "${result.opening.openingCode}" internally` +
      (result.posting.daysRemaining !== null ? ` for ${result.posting.daysRemaining} day(s)` : ''),
    entityType: EntityType.OPENING_POSTING,
    entityId: result.opening.id,
    entityLabel: result.opening.openingCode,
    afterData: {
      status: result.opening.status,
      expiresAt: result.posting.expiresAt,
      autoMove: result.posting.autoMove,
    },
  });
  ok(res, result, 201);
});

export const postExternal = handle(async (req: AuthRequest, res: Response) => {
  const { note } = postExternalSchema.parse(req.body ?? {});
  const result = await service.postExternally(actorOf(req), req.params.id, note);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_POSTINGS,
    action: Action.STATUS_CHANGE,
    actionLabel: `Published "${result.opening.openingCode}" externally`,
    entityType: EntityType.OPENING_POSTING,
    entityId: result.opening.id,
    entityLabel: result.opening.openingCode,
    afterData: { status: result.opening.status },
  });
  ok(res, result, 201);
});

export const close = handle(async (req: AuthRequest, res: Response) => {
  const { reason } = closePostingSchema.parse(req.body ?? {});
  const postings = await service.closePosting(
    actorOf(req),
    req.params.id,
    req.params.postingId,
    reason
  );
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_POSTINGS,
    action: Action.CANCEL,
    actionLabel: `Took down a job posting`,
    entityType: EntityType.OPENING_POSTING,
    entityId: req.params.postingId,
    afterData: { reason },
  });
  ok(res, postings);
});

/**
 * Run the auto-move sweep on demand. The cron does this hourly; the endpoint
 * exists so the behaviour can be exercised without waiting for the tick.
 */
export const runAutoMove = handle(async (req: AuthRequest, res: Response) => {
  const result = await service.runAutoMoveSweep();
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_POSTINGS,
    action: Action.RUN,
    actionLabel: `Ran the posting auto-move sweep — ${result.moved} of ${result.scanned} moved`,
    entityType: EntityType.OPENING_POSTING,
    afterData: result,
  });
  ok(res, result);
});
