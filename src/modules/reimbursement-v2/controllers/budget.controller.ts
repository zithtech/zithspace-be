// src/modules/reimbursement-v2/controllers/budget.controller.ts
// Thin HTTP layer over budget.service.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/budget.service';
import { createBudgetSchema, updateBudgetSchema } from '../validators/budget.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createBudgetSchema.parse(req.body);
  const budget = await service.createBudget(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT,
    page: Page.REIMBURSEMENT_POLICIES,
    action: Action.CREATE,
    actionLabel: `Created budget "${budget.name}" (${budget.scopeType})`,
    entityType: EntityType.REIMBURSEMENT_POLICY,
    entityId: budget.id,
    entityLabel: budget.name,
  });
  ok(res, budget, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  ok(res, await service.listBudgets(actorOf(req), { includeInactive }));
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getBudget(actorOf(req), req.params.id));
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateBudgetSchema.parse(req.body);
  const budget = await service.updateBudget(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT,
    page: Page.REIMBURSEMENT_POLICIES,
    action: Action.UPDATE,
    actionLabel: `Updated budget "${budget.name}"`,
    entityType: EntityType.REIMBURSEMENT_POLICY,
    entityId: budget.id,
    entityLabel: budget.name,
  });
  ok(res, budget);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getBudget(actor, req.params.id);
  await service.deleteBudget(actor, req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT,
    page: Page.REIMBURSEMENT_POLICIES,
    action: Action.DELETE,
    actionLabel: `Deleted budget "${existing.name}"`,
    entityType: EntityType.REIMBURSEMENT_POLICY,
    entityId: req.params.id,
    entityLabel: existing.name,
  });
  ok(res, { id: req.params.id, deleted: true });
});
