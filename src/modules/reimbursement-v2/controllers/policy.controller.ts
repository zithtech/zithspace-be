// src/modules/reimbursement-v2/controllers/policy.controller.ts
// Thin HTTP layer: validate input → call service → shape response.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/policy.service';
import { createPolicySchema, updatePolicySchema } from '../validators/policy.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

function policySnapshot(p: any) {
  return {
    name: p.name,
    code: p.code,
    description: p.description ?? null,
    autoApproveBelow: p.autoApproveBelow ?? null,
    isActive: p.isActive,
    assignments: (p.assignments ?? []).map((a: any) => ({ scopeType: a.scopeType, scopeId: a.scopeId })),
    lines: (p.lines ?? []).map((l: any) => ({
      categoryId: l.categoryId,
      maxPerClaim: l.maxPerClaim,
      monthlyLimit: l.monthlyLimit,
      yearlyLimit: l.yearlyLimit,
      perDayLimit: l.perDayLimit,
    })),
  };
}

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createPolicySchema.parse(req.body);
  const policy = await service.createPolicy(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT,
    page: Page.REIMBURSEMENT_POLICIES,
    action: Action.CREATE,
    actionLabel: `Created reimbursement policy "${policy.name}" (${policy.code})`,
    entityType: EntityType.REIMBURSEMENT_POLICY,
    entityId: policy.id,
    entityLabel: policy.name,
    afterData: policySnapshot(policy),
  });
  ok(res, policy, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const policies = await service.listPolicies(actorOf(req), { includeInactive });
  ok(res, policies);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const policy = await service.getPolicy(actorOf(req), req.params.id);
  ok(res, policy);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updatePolicySchema.parse(req.body);
  const policy = await service.updatePolicy(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT,
    page: Page.REIMBURSEMENT_POLICIES,
    action: Action.UPDATE,
    actionLabel: `Updated reimbursement policy "${policy.name}"`,
    entityType: EntityType.REIMBURSEMENT_POLICY,
    entityId: policy.id,
    entityLabel: policy.name,
    afterData: policySnapshot(policy),
  });
  ok(res, policy);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getPolicy(actor, req.params.id);
  await service.deletePolicy(actor, req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT,
    page: Page.REIMBURSEMENT_POLICIES,
    action: Action.DELETE,
    actionLabel: `Deleted reimbursement policy "${existing.name}" (${existing.code})`,
    entityType: EntityType.REIMBURSEMENT_POLICY,
    entityId: req.params.id,
    entityLabel: existing.name,
    beforeData: policySnapshot(existing),
  });
  ok(res, { id: req.params.id, deleted: true });
});
