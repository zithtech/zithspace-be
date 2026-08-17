// src/modules/leave-v2/controllers/leavePolicy.controller.ts
// Thin HTTP layer: validate input → call service → shape response.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/leavePolicy.service';
import {
  createLeavePolicySchema,
  updateLeavePolicySchema,
} from '../validators/leavePolicy.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '@/utils/transactionHistory';

// Header fields + assignment/line counts — enough to audit a policy change
// without dumping the full nested arrays into every diff.
function policySnapshot(p: any) {
  return {
    name: p.name,
    code: p.code,
    description: p.description ?? null,
    isActive: p.isActive,
    termCycle: p.termCycle,
    lopOnExhaustion: p.lopOnExhaustion,
    assignmentCount: Array.isArray(p.assignments) ? p.assignments.length : undefined,
    lineCount: Array.isArray(p.lines) ? p.lines.length : undefined,
  };
}

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createLeavePolicySchema.parse(req.body);
  const policy = await service.createPolicy(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_POLICIES,
    action: Action.CREATE,
    actionLabel: `Created leave policy "${policy.name}" (${policy.code})`,
    entityType: EntityType.LEAVE_POLICY,
    entityId: policy.id,
    entityLabel: policy.name,
    afterData: policySnapshot(policy),
  });
  ok(res, policy, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const opts = {
    includeInactive: req.query.includeInactive === 'true',
    search: req.query.search as string,
    status: req.query.status as string,
    limit: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    offset: (req.query.page && req.query.pageSize) ? (Number(req.query.page) - 1) * Number(req.query.pageSize) : undefined,
  };
  const policies = await service.listPolicies(actorOf(req), opts);
  ok(res, policies);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const policy = await service.getPolicy(actorOf(req), req.params.id);
  ok(res, policy);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateLeavePolicySchema.parse(req.body);
  const actor = actorOf(req);
  const before = await service.getPolicy(actor, req.params.id);
  const policy = await service.updatePolicy(actor, req.params.id, input);
  const { changedFields, before: b, after: a } = diffShallow(policySnapshot(before), policySnapshot(policy));
  if (changedFields.length > 0) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.LEAVES,
      page: Page.LEAVE_POLICIES,
      action: Action.UPDATE,
      actionLabel: `Updated leave policy "${policy.name}"`,
      entityType: EntityType.LEAVE_POLICY,
      entityId: policy.id,
      entityLabel: policy.name,
      beforeData: b,
      afterData: a,
      changedFields,
    });
  }
  ok(res, policy);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getPolicy(actor, req.params.id);
  await service.deletePolicy(actor, req.params.id);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_POLICIES,
    action: Action.DELETE,
    actionLabel: `Deleted leave policy "${existing.name}" (${existing.code})`,
    entityType: EntityType.LEAVE_POLICY,
    entityId: req.params.id,
    entityLabel: existing.name,
    beforeData: policySnapshot(existing),
  });
  ok(res, { id: req.params.id, deleted: true });
});
