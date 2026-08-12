// src/modules/reimbursement-v2/controllers/reimbursementSettings.controller.ts

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/reimbursementSettings.service';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

export const getMailSettings = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = await service.getMailSettings(actor);
  ok(res, data);
});

export const updateMailSettings = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = await service.updateMailSettings(actor, req.body);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT_V2,
    page: Page.REIMBURSEMENT_V2_SETTINGS,
    action: Action.UPDATE,
    actionLabel: `Updated reimbursement mail settings`,
    entityType: EntityType.REIMBURSEMENT_SETTINGS,
    entityId: actor.tenantId,
  });
  ok(res, data);
});
