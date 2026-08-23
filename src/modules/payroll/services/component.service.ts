// src/modules/payroll/services/component.service.ts
//
// Business logic for Salary Components. Owns the transaction boundary
// (withTenant) and the rules (code uniqueness, percentage normalisation,
// existence → 404). Repositories do the SQL.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/component.repo';
import { Actor, ComponentCategory, PayComponent, PayrollError } from '../types';
import { CreateComponentInput, UpdateComponentInput } from '../validators/component.validator';

export async function createComponent(
  actor: Actor,
  input: CreateComponentInput
): Promise<PayComponent> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsByCode(client, input.code)) {
      throw PayrollError.conflict(`A component with code "${input.code}" already exists`);
    }
    // Only percentage components carry a base; clear it otherwise.
    const percentageOf = input.calculationType === 'percentage' ? input.percentageOf ?? null : null;
    return repo.insert(client, {
      name: input.name,
      code: input.code,
      category: input.category,
      calculationType: input.calculationType,
      percentageOf,
      defaultValue: input.defaultValue ?? null,
      isTaxable: input.isTaxable,
      isProRata: input.isProRata,
      partOfCtc: input.partOfCtc,
      considerForPf: input.considerForPf,
      considerForEsi: input.considerForEsi,
      showOnPayslip: input.showOnPayslip,
      displayOrder: input.displayOrder,
      description: input.description ?? null,
      isActive: input.isActive,
      createdBy: actor.userId,
    });
  });
}

export async function listComponents(
  actor: Actor,
  opts: { status?: 'all' | 'active' | 'inactive'; category?: ComponentCategory; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: PayComponent[]; total: number }> {
  return withTenant(actor.tenantId, (client) => repo.findAll(client, opts));
}

export async function getComponent(actor: Actor, id: string): Promise<PayComponent> {
  return withTenant(actor.tenantId, async (client) => {
    const found = await repo.findById(client, id);
    if (!found) throw PayrollError.notFound('Salary component');
    return found;
  });
}

export async function updateComponent(
  actor: Actor,
  id: string,
  input: UpdateComponentInput
): Promise<PayComponent> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findById(client, id);
    if (!existing) throw PayrollError.notFound('Salary component');

    if (input.code && (await repo.existsByCode(client, input.code, id))) {
      throw PayrollError.conflict(`A component with code "${input.code}" already exists`);
    }

    // Keep percentage_of consistent with the effective calculation type.
    const data: typeof input & { percentageOf?: typeof input.percentageOf } = { ...input };
    const effectiveCalc = input.calculationType ?? existing.calculationType;
    if (effectiveCalc !== 'percentage') {
      data.percentageOf = null;
    }

    const updated = await repo.update(client, id, { ...data, updatedBy: actor.userId });
    if (!updated) throw PayrollError.notFound('Salary component');
    return updated;
  });
}

export async function deleteComponent(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDelete(client, id, actor.userId);
    if (!ok) throw PayrollError.notFound('Salary component');
  });
}
