// src/modules/leave-v2/controllers/approvals.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { RBACService } from '@/modules/rbac/rbac.service';
import { Permissions } from '@/types/permissions';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/approvals.service';
import { withdrawDecisionSchema } from '../validators/leaveRequest.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

function approvalLabel(r: any): string {
  const type = r?.leaveTypeName ?? 'Leave';
  const who = r?.userName ? `${r.userName}'s ` : '';
  const range = r?.fromDate === r?.toDate ? r?.fromDate : `${r?.fromDate} → ${r?.toDate}`;
  return `${who}${type} · ${range}`;
}

// Can this user see/decide ALL requests (HR/admin), vs only their direct reports?
async function canManageAll(req: AuthRequest): Promise<boolean> {
  const u = req.user as any;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  return RBACService.hasPermission(u.id, u.tenantId, Permissions.LEAVE_MANAGE, u.role);
}

export const list = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listApprovals(actorOf(req), await canManageAll(req)));
});

export const approve = handle(async (req: AuthRequest, res: Response) => {
  const note = req.body?.note ?? null;
  const updated = await service.approve(actorOf(req), req.params.id, note, await canManageAll(req));
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_APPROVALS,
    action: Action.APPROVE,
    actionLabel: `Approved leave request (${approvalLabel(updated)})`,
    entityType: EntityType.LEAVE_REQUEST,
    entityId: req.params.id,
    entityLabel: approvalLabel(updated),
    beforeData: { status: 'pending' },
    afterData: { status: updated.status, paidUnits: updated.paidUnits, lopUnits: updated.lopUnits },
    changedFields: ['status', 'paidUnits', 'lopUnits'],
    metadata: note ? { decisionNote: note } : null,
  });
  ok(res, updated);
});

export const withdrawDecision = handle(async (req: AuthRequest, res: Response) => {
  const { approve, note } = withdrawDecisionSchema.parse(req.body);
  const { before, request, plan } = await service.decideWithdrawal(
    actorOf(req),
    req.params.id,
    approve,
    note ?? null,
    await canManageAll(req)
  );
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_APPROVALS,
    action: approve ? Action.APPROVE : Action.REJECT,
    actionLabel: `${approve ? 'Confirmed' : 'Declined'} leave withdrawal (${approvalLabel(request)})`,
    entityType: EntityType.LEAVE_REQUEST,
    entityId: req.params.id,
    entityLabel: approvalLabel(request),
    beforeData: { status: before.status, withdrawalStatus: 'requested', paidUnits: before.paidUnits },
    afterData: { status: request.status, withdrawalStatus: request.withdrawalStatus, paidUnits: request.paidUnits },
    changedFields: ['status', 'withdrawalStatus', 'paidUnits'],
    metadata: {
      decision: approve ? 'confirmed' : 'declined',
      releasedUnits: plan ? plan.releasedTotal : 0,
      creditedUnits: plan ? plan.releasedPaid : 0,
      ...(note ? { decisionNote: note } : {}),
    },
  });
  ok(res, { request, plan });
});

export const reject = handle(async (req: AuthRequest, res: Response) => {
  const note = req.body?.note ?? null;
  const updated = await service.reject(actorOf(req), req.params.id, note, await canManageAll(req));
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_APPROVALS,
    action: Action.REJECT,
    actionLabel: `Rejected leave request (${approvalLabel(updated)})`,
    entityType: EntityType.LEAVE_REQUEST,
    entityId: req.params.id,
    entityLabel: approvalLabel(updated),
    beforeData: { status: 'pending' },
    afterData: { status: updated.status },
    changedFields: ['status'],
    metadata: note ? { decisionNote: note } : null,
  });
  ok(res, updated);
});
