// src/modules/reimbursement-v2/services/budget.service.ts
// Budget CRUD + derived spend. Owns the transaction boundary.

import { TenantClient, withTenant } from '../db/pool';
import * as repo from '../repositories/budget.repo';
import { Actor, Budget, BudgetWithSpend, ReimbursementV2Error } from '../types';
import { CreateBudgetInput, UpdateBudgetInput } from '../validators/budget.validator';

async function withSpend(client: TenantClient, budget: Budget): Promise<BudgetWithSpend> {
  const spent = await repo.spendFor(client, budget);
  const remaining = Math.round((budget.amount - spent) * 100) / 100;
  const utilization = budget.amount > 0 ? Math.round((spent / budget.amount) * 10000) / 10000 : 0;
  return { ...budget, spent, remaining, utilization };
}

function toData(input: CreateBudgetInput | UpdateBudgetInput): repo.BudgetData {
  return {
    name: input.name,
    scopeType: input.scopeType,
    scopeId: input.scopeId ?? null,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    amount: input.amount,
    currency: input.currency,
    isActive: input.isActive,
  };
}

export async function createBudget(actor: Actor, input: CreateBudgetInput): Promise<BudgetWithSpend> {
  return withTenant(actor.tenantId, async (client) => {
    const budget = await repo.insert(client, toData(input), actor.userId);
    return withSpend(client, budget);
  });
}

export async function updateBudget(
  actor: Actor,
  id: string,
  input: UpdateBudgetInput
): Promise<BudgetWithSpend> {
  return withTenant(actor.tenantId, async (client) => {
    const updated = await repo.update(client, id, toData(input), actor.userId);
    if (!updated) throw ReimbursementV2Error.notFound('Budget');
    return withSpend(client, updated);
  });
}

export async function listBudgets(
  actor: Actor,
  opts: { includeInactive?: boolean } = {}
): Promise<BudgetWithSpend[]> {
  return withTenant(actor.tenantId, async (client) => {
    const budgets = await repo.list(client, opts);
    return Promise.all(budgets.map((b) => withSpend(client, b)));
  });
}

export async function getBudget(actor: Actor, id: string): Promise<BudgetWithSpend> {
  return withTenant(actor.tenantId, async (client) => {
    const budget = await repo.findById(client, id);
    if (!budget) throw ReimbursementV2Error.notFound('Budget');
    return withSpend(client, budget);
  });
}

export async function deleteBudget(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDelete(client, id, actor.userId);
    if (!ok) throw ReimbursementV2Error.notFound('Budget');
  });
}
