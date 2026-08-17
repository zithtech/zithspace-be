// src/modules/leave-v2/controllers/adjustment.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import { LeaveV2Error } from '../types';
import * as service from '../services/adjustment.service';
import { createAdjustmentSchema } from '../validators/adjustment.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// Compact snapshot of a manual balance adjustment for the activity feed.
function adjustmentSnapshot(e: any) {
  return {
    employee: e.userName,
    leaveType: e.leaveTypeName,
    entryType: e.entryType,
    units: e.units,
    effectiveDate: e.effectiveDate,
    note: e.note ?? null,
  };
}

export const list = handle(async (req: AuthRequest, res: Response) => {
  const opts = {
    search: req.query.search as string,
    dir: req.query.dir as string,
    limit: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    offset: (req.query.page && req.query.pageSize) ? (Number(req.query.page) - 1) * Number(req.query.pageSize) : undefined,
  };
  ok(res, await service.listAdjustments(actorOf(req), opts));
});

export const employees = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getEmployeeOptions(actorOf(req)));
});

export const balance = handle(async (req: AuthRequest, res: Response) => {
  const { employeeId, leaveTypeId } = req.query as { employeeId?: string; leaveTypeId?: string };
  if (!employeeId || !leaveTypeId) throw LeaveV2Error.badRequest('employeeId and leaveTypeId are required');
  ok(res, await service.getBalance(actorOf(req), employeeId, leaveTypeId));
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createAdjustmentSchema.parse(req.body);
  const result = await service.createAdjustment(actorOf(req), input);
  const { entry, newBalance } = result;
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_ADJUSTMENTS,
    action: Action.CREATE,
    actionLabel: `${entry.note} for ${entry.userName} (${signed(entry.units)} ${entry.leaveTypeName})`,
    entityType: EntityType.LEAVE_ADJUSTMENT,
    entityId: entry.id,
    entityLabel: `${entry.userName} · ${entry.leaveTypeName}`,
    afterData: adjustmentSnapshot(entry),
    metadata: { newBalance },
  });
  ok(res, result, 201);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const result = await service.deleteAdjustment(actorOf(req), req.params.id);
  const { entry, newBalance } = result;
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_ADJUSTMENTS,
    action: Action.DELETE,
    actionLabel: `Reversed ${entry.note} for ${entry.userName} (${signed(entry.units)} ${entry.leaveTypeName})`,
    entityType: EntityType.LEAVE_ADJUSTMENT,
    entityId: req.params.id,
    entityLabel: `${entry.userName} · ${entry.leaveTypeName}`,
    beforeData: adjustmentSnapshot(entry),
    metadata: { newBalance },
  });
  ok(res, result);
});
