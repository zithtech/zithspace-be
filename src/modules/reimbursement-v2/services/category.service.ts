// src/modules/reimbursement-v2/services/category.service.ts
//
// Business logic for Expense Categories. Owns the transaction boundary
// (withTenant) and the rules (uniqueness, existence → 404). Repos do the SQL.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/category.repo';
import { Actor, ExpenseCategory, ReimbursementV2Error } from '../types';
import { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

export async function createCategory(
  actor: Actor,
  input: CreateCategoryInput
): Promise<ExpenseCategory> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsByCode(client, input.code)) {
      throw ReimbursementV2Error.conflict(
        `An expense category with code "${input.code}" already exists`
      );
    }
    return repo.insert(client, {
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      glCode: input.glCode ?? null,
      kind: input.kind,
      mileageRate: input.mileageRate ?? null,
      mileageUnit: input.mileageUnit ?? null,
      maxPerClaim: input.maxPerClaim ?? null,
      monthlyLimit: input.monthlyLimit ?? null,
      yearlyLimit: input.yearlyLimit ?? null,
      perDayLimit: input.perDayLimit ?? null,
      receiptRequired: input.receiptRequired,
      receiptRequiredAbove: input.receiptRequiredAbove ?? null,
      isActive: input.isActive,
      createdBy: actor.userId,
    });
  });
}

export async function listCategories(
  actor: Actor,
  opts: { includeInactive?: boolean; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: ExpenseCategory[]; total: number }> {
  return withTenant(actor.tenantId, (client) => repo.findAll(client, opts));
}

export async function getCategory(actor: Actor, id: string): Promise<ExpenseCategory> {
  return withTenant(actor.tenantId, async (client) => {
    const found = await repo.findById(client, id);
    if (!found) throw ReimbursementV2Error.notFound('Expense category');
    return found;
  });
}

export async function updateCategory(
  actor: Actor,
  id: string,
  input: UpdateCategoryInput
): Promise<ExpenseCategory> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findById(client, id);
    if (!existing) throw ReimbursementV2Error.notFound('Expense category');

    if (input.code && (await repo.existsByCode(client, input.code, id))) {
      throw ReimbursementV2Error.conflict(
        `An expense category with code "${input.code}" already exists`
      );
    }

    const updated = await repo.update(client, id, { ...input, updatedBy: actor.userId });
    if (!updated) throw ReimbursementV2Error.notFound('Expense category');
    return updated;
  });
}

export async function deleteCategory(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDelete(client, id, actor.userId);
    if (!ok) throw ReimbursementV2Error.notFound('Expense category');
  });
}
