// src/modules/reimbursement-v2/controllers/finance.controller.ts
// Finance settlement HTTP layer over finance.service.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/finance.service';
import { markPaidSchema } from '../validators/claim.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

export const listPayable = handle(async (req: AuthRequest, res: Response) => {
  const claims = await service.listPayable(actorOf(req));
  ok(res, claims);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const claim = await service.getClaim(actorOf(req), req.params.id);
  ok(res, claim);
});

export const markPaid = handle(async (req: AuthRequest, res: Response) => {
  const input = markPaidSchema.parse(req.body);
  const claim = await service.markPaid(actorOf(req), req.params.id, {
    paymentReference: input.paymentReference,
    remarks: input.remarks ?? null,
  });
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT_V2,
    page: Page.REIMBURSEMENT_V2_FINANCE,
    action: Action.UPDATE,
    actionLabel: `Marked reimbursement claim ${claim.claimNo} as paid (${claim.paymentReference})`,
    entityType: EntityType.REIMBURSEMENT_CLAIM,
    entityId: claim.id,
    entityLabel: claim.claimNo,
  });
  ok(res, claim);
});
