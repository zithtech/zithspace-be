// src/modules/payroll/services/group.service.ts
//
// Business logic for Pay Groups. Owns the transaction boundary and the rules
// (code uniqueness, schedule must exist).

import { withTenant } from '../db/pool';
import * as repo from '../repositories/group.repo';
import { Actor, PayGroup, PayGroupListItem, PayrollError } from '../types';
import { CreateGroupInput, UpdateGroupInput } from '../validators/schedule.validator';

export async function createGroup(actor: Actor, input: CreateGroupInput): Promise<PayGroup> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsByCode(client, input.code)) {
      throw PayrollError.conflict(`A pay group with code "${input.code}" already exists`);
    }
    if (!(await repo.scheduleExists(client, input.scheduleId))) {
      throw PayrollError.badRequest('The selected pay schedule does not exist');
    }
    return repo.insert(client, {
      name: input.name,
      code: input.code,
      scheduleId: input.scheduleId,
      legalEntity: input.legalEntity ?? null,
      description: input.description ?? null,
      isActive: input.isActive,
      createdBy: actor.userId,
    });
  });
}

export async function listGroups(
  actor: Actor,
  opts: { includeInactive?: boolean; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: PayGroupListItem[]; total: number }> {
  return withTenant(actor.tenantId, (client) => repo.findAll(client, opts));
}

export async function getGroup(actor: Actor, id: string): Promise<PayGroup> {
  return withTenant(actor.tenantId, async (client) => {
    const found = await repo.findById(client, id);
    if (!found) throw PayrollError.notFound('Pay group');
    return found;
  });
}

export async function updateGroup(actor: Actor, id: string, input: UpdateGroupInput): Promise<PayGroup> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findById(client, id);
    if (!existing) throw PayrollError.notFound('Pay group');
    if (input.code && (await repo.existsByCode(client, input.code, id))) {
      throw PayrollError.conflict(`A pay group with code "${input.code}" already exists`);
    }
    if (input.scheduleId && !(await repo.scheduleExists(client, input.scheduleId))) {
      throw PayrollError.badRequest('The selected pay schedule does not exist');
    }
    const updated = await repo.update(client, id, { ...input, updatedBy: actor.userId });
    if (!updated) throw PayrollError.notFound('Pay group');
    return updated;
  });
}

export async function deleteGroup(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDelete(client, id, actor.userId);
    if (!ok) throw PayrollError.notFound('Pay group');
  });
}
