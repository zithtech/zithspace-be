// src/modules/reimbursement-v2/controllers/category.controller.ts
// Thin HTTP layer: validate input → call service → shape response.
// No business logic here.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/category.service';
import {
  createCategorySchema,
  updateCategorySchema,
} from '../validators/category.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
  diffShallow,
} from '@/utils/transactionHistory';

// Fields worth showing in the activity feed's before/after diff.
function categorySnapshot(c: any) {
  return {
    name: c.name,
    code: c.code,
    description: c.description ?? null,
    glCode: c.glCode ?? null,
    kind: c.kind,
    mileageRate: c.mileageRate ?? null,
    mileageUnit: c.mileageUnit ?? null,
    maxPerClaim: c.maxPerClaim ?? null,
    monthlyLimit: c.monthlyLimit ?? null,
    yearlyLimit: c.yearlyLimit ?? null,
    perDayLimit: c.perDayLimit ?? null,
    receiptRequired: c.receiptRequired,
    receiptRequiredAbove: c.receiptRequiredAbove ?? null,
    isActive: c.isActive,
  };
}

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createCategorySchema.parse(req.body);
  const category = await service.createCategory(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT,
    page: Page.REIMBURSEMENT_CATEGORIES,
    action: Action.CREATE,
    actionLabel: `Created expense category "${category.name}" (${category.code})`,
    entityType: EntityType.REIMBURSEMENT_CATEGORY,
    entityId: category.id,
    entityLabel: category.name,
    afterData: categorySnapshot(category),
  });
  ok(res, category, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const categories = await service.listCategories(actorOf(req), { includeInactive });
  ok(res, categories);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const category = await service.getCategory(actorOf(req), req.params.id);
  ok(res, category);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateCategorySchema.parse(req.body);
  const actor = actorOf(req);
  const before = await service.getCategory(actor, req.params.id);
  const category = await service.updateCategory(actor, req.params.id, input);
  const { changedFields, before: b, after: a } = diffShallow(
    categorySnapshot(before),
    categorySnapshot(category)
  );
  if (changedFields.length > 0) {
    recordTransaction({
      req,
      section: Section.FINANCE,
      module: Module.REIMBURSEMENT,
      page: Page.REIMBURSEMENT_CATEGORIES,
      action: Action.UPDATE,
      actionLabel: `Updated expense category "${category.name}"`,
      entityType: EntityType.REIMBURSEMENT_CATEGORY,
      entityId: category.id,
      entityLabel: category.name,
      beforeData: b,
      afterData: a,
      changedFields,
    });
  }
  ok(res, category);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getCategory(actor, req.params.id);
  await service.deleteCategory(actor, req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.REIMBURSEMENT,
    page: Page.REIMBURSEMENT_CATEGORIES,
    action: Action.DELETE,
    actionLabel: `Deleted expense category "${existing.name}" (${existing.code})`,
    entityType: EntityType.REIMBURSEMENT_CATEGORY,
    entityId: req.params.id,
    entityLabel: existing.name,
    beforeData: categorySnapshot(existing),
  });
  ok(res, { id: req.params.id, deleted: true });
});
