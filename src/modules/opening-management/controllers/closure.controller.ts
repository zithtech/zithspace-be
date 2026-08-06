// src/modules/opening-management/controllers/closure.controller.ts
// Thin HTTP layer for Phase 7 closing and archiving.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/closure.service';
import { archiveSchema, closeOpeningSchema } from '../validators/closure.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

export const reasons = handle(async (_req: AuthRequest, res: Response) => {
  ok(res, service.getClosureReasons());
});

/** Openings that have met their hiring target but are still open. */
export const closureCandidates = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listClosureCandidates(actorOf(req)));
});

export const close = handle(async (req: AuthRequest, res: Response) => {
  const input = closeOpeningSchema.parse(req.body);
  const result = await service.closeOpening(actorOf(req), req.params.id, input);
  const o = result.opening;

  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_DETAIL,
    action: Action.COMPLETE,
    actionLabel:
      `Closed opening "${o.openingCode} — ${o.jobTitle}" as ${input.closureReason}` +
      (result.archived ? ' and archived it' : ''),
    entityType: EntityType.OPENING,
    entityId: o.id,
    entityLabel: o.openingCode,
    afterData: {
      status: result.status,
      closureReason: o.closureReason,
      archived: result.archived,
      postingsClosed: result.postingsClosed,
      openApplications: result.openApplications,
      applicationsRejected: result.applicationsRejected,
    },
    changedFields: ['status', 'closureReason'],
  });
  ok(res, result);
});

export const archive = handle(async (req: AuthRequest, res: Response) => {
  const input = archiveSchema.parse(req.body ?? {});
  const opening = await service.archiveOpening(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_DETAIL,
    action: Action.ARCHIVE,
    actionLabel: `Archived opening "${opening.openingCode} — ${opening.jobTitle}"`,
    entityType: EntityType.OPENING,
    entityId: opening.id,
    entityLabel: opening.openingCode,
    afterData: { isArchived: true },
  });
  ok(res, opening);
});

export const unarchive = handle(async (req: AuthRequest, res: Response) => {
  const opening = await service.unarchiveOpening(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_DETAIL,
    action: Action.RESTORE,
    actionLabel: `Un-archived opening "${opening.openingCode} — ${opening.jobTitle}"`,
    entityType: EntityType.OPENING,
    entityId: opening.id,
    entityLabel: opening.openingCode,
    afterData: { isArchived: false },
  });
  ok(res, opening);
});
