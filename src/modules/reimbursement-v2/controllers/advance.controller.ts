// src/modules/reimbursement-v2/controllers/advance.controller.ts
// Thin HTTP layer for cash advances (self-service + manager + finance).

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { RBACService } from '@/modules/rbac/rbac.service';
import { Permissions } from '@/types/permissions';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/advance.service';
import { createAdvanceSchema } from '../validators/advance.validator';
import { decisionSchema, markPaidSchema } from '../validators/claim.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

function record(req: AuthRequest, a: any, action: string, label: string) {
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT_V2,
    page: Page.REIMBURSEMENT_V2_ADVANCES,
    action,
    actionLabel: label,
    entityType: EntityType.REIMBURSEMENT_ADVANCE,
    entityId: a.id,
    entityLabel: a.advanceNo,
  });
}

// self-service
export const request = handle(async (req: AuthRequest, res: Response) => {
  const input = createAdvanceSchema.parse(req.body);
  const a = await service.requestAdvance(actorOf(req), input);
  record(req, a, Action.CREATE, `Requested cash advance ${a.advanceNo} (${a.amount} ${a.currency})`);
  ok(res, a, 201);
});

export const listMine = handle(async (req: AuthRequest, res: Response) => {
  const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  const { advances, total } = await service.listMine(actorOf(req), { status, search, page, limit });

  res.json({
    success: true,
    data: advances,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

export const getMine = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getMine(actorOf(req), req.params.id));
});

export const cancel = handle(async (req: AuthRequest, res: Response) => {
  const { remarks } = decisionSchema.parse(req.body ?? {});
  const a = await service.cancel(actorOf(req), req.params.id, remarks);
  record(req, a, Action.CANCEL, `Cancelled cash advance ${a.advanceNo}`);
  ok(res, a);
});

// Can this user decide ALL advances (super_admin / admin / manage) vs only their
// direct reports' — same rule as claim approvals.
async function canManageAll(req: AuthRequest): Promise<boolean> {
  const u = req.user as any;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  return RBACService.hasPermission(u.id, u.tenantId, Permissions.REIMBURSEMENT_MANAGE, u.role);
}

// manager
export const listPending = handle(async (req: AuthRequest, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const { data, total } = await service.listPending(actorOf(req), await canManageAll(req), { page, limit });
  res.json({
    success: true,
    data,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

export const approve = handle(async (req: AuthRequest, res: Response) => {
  const { remarks } = decisionSchema.parse(req.body ?? {});
  const a = await service.approve(actorOf(req), req.params.id, remarks ?? null, await canManageAll(req));
  record(req, a, Action.APPROVE, `Approved cash advance ${a.advanceNo}`);
  ok(res, a);
});

export const reject = handle(async (req: AuthRequest, res: Response) => {
  const { remarks } = decisionSchema.parse(req.body ?? {});
  const a = await service.reject(actorOf(req), req.params.id, remarks ?? null, await canManageAll(req));
  record(req, a, Action.REJECT, `Rejected cash advance ${a.advanceNo}`);
  ok(res, a);
});

// finance
export const listPayable = handle(async (req: AuthRequest, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const { data, total } = await service.listPayable(actorOf(req), { page, limit });
  res.json({
    success: true,
    data,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

export const markPaid = handle(async (req: AuthRequest, res: Response) => {
  const input = markPaidSchema.parse(req.body);
  const a = await service.markPaid(actorOf(req), req.params.id, {
    paymentReference: input.paymentReference,
    remarks: input.remarks ?? null,
  });
  record(req, a, Action.UPDATE, `Paid cash advance ${a.advanceNo} (${a.paymentReference})`);
  ok(res, a);
});

export const reconcile = handle(async (req: AuthRequest, res: Response) => {
  const a = await service.reconcile(actorOf(req), req.params.id);
  ok(res, a);
});
