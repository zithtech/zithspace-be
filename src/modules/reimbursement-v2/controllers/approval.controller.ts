// src/modules/reimbursement-v2/controllers/approval.controller.ts
// Manager inbox + decisions. Thin HTTP layer over approval.service.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { RBACService } from '@/modules/rbac/rbac.service';
import { Permissions } from '@/types/permissions';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/approval.service';
import { decisionSchema } from '../validators/claim.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

// Can this user see/decide ALL claims (super_admin / admin / manage), vs only
// the requests of their direct reports? Mirrors the Leaves 2.0 approval rule.
async function canManageAll(req: AuthRequest): Promise<boolean> {
  const u = req.user as any;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  return RBACService.hasPermission(u.id, u.tenantId, Permissions.REIMBURSEMENT_MANAGE, u.role);
}

export const listPending = handle(async (req: AuthRequest, res: Response) => {
  const claims = await service.listPending(actorOf(req), await canManageAll(req));
  ok(res, claims);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const claim = await service.getForApprover(actorOf(req), req.params.id, await canManageAll(req));
  ok(res, claim);
});

function record(req: AuthRequest, claim: any, action: string, label: string) {
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT_V2,
    page: Page.REIMBURSEMENT_V2_APPROVALS,
    action,
    actionLabel: label,
    entityType: EntityType.REIMBURSEMENT_CLAIM,
    entityId: claim.id,
    entityLabel: claim.claimNo,
  });
}

export const approve = handle(async (req: AuthRequest, res: Response) => {
  const { remarks } = decisionSchema.parse(req.body ?? {});
  const claim = await service.approve(actorOf(req), req.params.id, remarks ?? null, await canManageAll(req));
  record(req, claim, Action.APPROVE, `Approved reimbursement claim ${claim.claimNo}`);
  ok(res, claim);
});

export const reject = handle(async (req: AuthRequest, res: Response) => {
  const { remarks } = decisionSchema.parse(req.body ?? {});
  const claim = await service.reject(actorOf(req), req.params.id, remarks ?? null, await canManageAll(req));
  record(req, claim, Action.REJECT, `Rejected reimbursement claim ${claim.claimNo}`);
  ok(res, claim);
});

export const sendBack = handle(async (req: AuthRequest, res: Response) => {
  const { remarks } = decisionSchema.parse(req.body ?? {});
  const claim = await service.sendBack(actorOf(req), req.params.id, remarks ?? null, await canManageAll(req));
  record(req, claim, Action.UPDATE, `Sent back reimbursement claim ${claim.claimNo}`);
  ok(res, claim);
});
