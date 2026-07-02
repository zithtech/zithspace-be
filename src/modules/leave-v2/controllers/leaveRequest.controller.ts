// src/modules/leave-v2/controllers/leaveRequest.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/leaveRequest.service';
import { applyLeaveSchema, withdrawRequestSchema } from '../validators/leaveRequest.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

// Compact snapshot of a leave request for the activity feed's before/after diff.
function leaveSnapshot(r: any) {
  return {
    leaveType: r.leaveTypeName ?? null,
    fromDate: r.fromDate,
    toDate: r.toDate,
    dayPortion: r.dayPortion,
    totalUnits: r.totalUnits,
    paidUnits: r.paidUnits,
    lopUnits: r.lopUnits,
    status: r.status,
    actualUnits: r.actualUnits ?? null,
    withdrawalStatus: r.withdrawalStatus ?? null,
    reason: r.reason ?? null,
  };
}

function leaveLabel(r: any): string {
  const type = r?.leaveTypeName ?? 'Leave';
  return r?.fromDate === r?.toDate ? `${type} · ${r?.fromDate}` : `${type} · ${r?.fromDate} → ${r?.toDate}`;
}

export const myBalances = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getMyBalances(actorOf(req)));
});

export const myRequests = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listMyRequests(actorOf(req)));
});

export const holidayDates = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getHolidayDates(actorOf(req)));
});

export const apply = handle(async (req: AuthRequest, res: Response) => {
  const input = applyLeaveSchema.parse(req.body);
  const request = await service.applyLeave(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_REQUESTS,
    action: Action.APPLY,
    actionLabel: `Applied for leave (${leaveLabel(request)})`,
    entityType: EntityType.LEAVE_REQUEST,
    entityId: request.id,
    entityLabel: leaveLabel(request),
    afterData: leaveSnapshot(request),
  });
  ok(res, request, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = applyLeaveSchema.parse(req.body);
  const updated = await service.updateMyRequest(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_REQUESTS,
    action: Action.UPDATE,
    actionLabel: `Updated leave request (${leaveLabel(updated)})`,
    entityType: EntityType.LEAVE_REQUEST,
    entityId: updated.id,
    entityLabel: leaveLabel(updated),
    afterData: leaveSnapshot(updated),
  });
  ok(res, updated);
});

export const cancel = handle(async (req: AuthRequest, res: Response) => {
  const existing = await service.cancelMyRequest(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_REQUESTS,
    action: Action.CANCEL,
    actionLabel: `Cancelled leave request${existing ? ` (${leaveLabel(existing)})` : ''}`,
    entityType: EntityType.LEAVE_REQUEST,
    entityId: req.params.id,
    entityLabel: existing ? leaveLabel(existing) : null,
    beforeData: existing ? { status: existing.status } : null,
    afterData: { status: 'cancelled' },
    changedFields: ['status'],
  });
  ok(res, { id: req.params.id, cancelled: true });
});

export const withdrawRequest = handle(async (req: AuthRequest, res: Response) => {
  const input = withdrawRequestSchema.parse(req.body);
  const { before, request, plan } = await service.requestWithdrawal(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_REQUESTS,
    action: Action.SUBMIT,
    actionLabel: `Requested withdrawal of ${plan.releasedTotal} day(s) (${leaveLabel(request)})`,
    entityType: EntityType.LEAVE_REQUEST,
    entityId: request.id,
    entityLabel: leaveLabel(request),
    beforeData: leaveSnapshot(before),
    afterData: leaveSnapshot(request),
    changedFields: ['withdrawalStatus'],
    metadata: { withdrawalStatus: 'requested', releasedUnits: plan.releasedTotal, mode: plan.mode },
  });
  ok(res, { request, plan });
});
