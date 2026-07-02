// src/modules/leave-v2/controllers/leaveType.controller.ts
// Thin HTTP layer: validate input → call service → shape response.
// No business logic here.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/leaveType.service';
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
} from '../validators/leaveType.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '@/utils/transactionHistory';

// Fields worth showing in the activity feed's before/after diff.
function leaveTypeSnapshot(t: any) {
  return {
    name: t.name,
    code: t.code,
    unit: t.unit,
    isPaid: t.isPaid,
    requiresApproval: t.requiresApproval,
    color: t.color ?? null,
    description: t.description ?? null,
    isActive: t.isActive,
  };
}

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createLeaveTypeSchema.parse(req.body);
  const leaveType = await service.createLeaveType(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_TYPES,
    action: Action.CREATE,
    actionLabel: `Created leave type "${leaveType.name}" (${leaveType.code})`,
    entityType: EntityType.LEAVE_TYPE,
    entityId: leaveType.id,
    entityLabel: leaveType.name,
    afterData: leaveTypeSnapshot(leaveType),
  });
  ok(res, leaveType, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const leaveTypes = await service.listLeaveTypes(actorOf(req), { includeInactive });
  ok(res, leaveTypes);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const leaveType = await service.getLeaveType(actorOf(req), req.params.id);
  ok(res, leaveType);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateLeaveTypeSchema.parse(req.body);
  const actor = actorOf(req);
  const before = await service.getLeaveType(actor, req.params.id);
  const leaveType = await service.updateLeaveType(actor, req.params.id, input);
  const { changedFields, before: b, after: a } = diffShallow(leaveTypeSnapshot(before), leaveTypeSnapshot(leaveType));
  if (changedFields.length > 0) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.LEAVES,
      page: Page.LEAVE_TYPES,
      action: Action.UPDATE,
      actionLabel: `Updated leave type "${leaveType.name}"`,
      entityType: EntityType.LEAVE_TYPE,
      entityId: leaveType.id,
      entityLabel: leaveType.name,
      beforeData: b,
      afterData: a,
      changedFields,
    });
  }
  ok(res, leaveType);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getLeaveType(actor, req.params.id);
  await service.deleteLeaveType(actor, req.params.id);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_TYPES,
    action: Action.DELETE,
    actionLabel: `Deleted leave type "${existing.name}" (${existing.code})`,
    entityType: EntityType.LEAVE_TYPE,
    entityId: req.params.id,
    entityLabel: existing.name,
    beforeData: leaveTypeSnapshot(existing),
  });
  ok(res, { id: req.params.id, deleted: true });
});
