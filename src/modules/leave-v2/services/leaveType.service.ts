// src/modules/leave-v2/services/leaveType.service.ts
//
// Business logic for Leave Types. Owns the transaction boundary (withTenant)
// and the rules (uniqueness, existence → 404). Repositories do the SQL.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/leaveType.repo';
import { Actor, LeaveType, LeaveV2Error } from '../types';
import { CreateLeaveTypeInput, UpdateLeaveTypeInput } from '../validators/leaveType.validator';

export async function createLeaveType(
  actor: Actor,
  input: CreateLeaveTypeInput
): Promise<LeaveType> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsByCode(client, input.code)) {
      throw LeaveV2Error.conflict(`A leave type with code "${input.code}" already exists`);
    }
    return repo.insert(client, {
      name: input.name,
      code: input.code,
      unit: input.unit,
      isPaid: input.isPaid,
      requiresApproval: input.requiresApproval,
      color: input.color ?? null,
      description: input.description ?? null,
      isActive: input.isActive,
      createdBy: actor.userId,
    });
  });
}

export async function listLeaveTypes(
  actor: Actor,
  opts: { includeInactive?: boolean } = {}
): Promise<LeaveType[]> {
  return withTenant(actor.tenantId, (client) => repo.findAll(client, opts));
}

export async function getLeaveType(actor: Actor, id: string): Promise<LeaveType> {
  return withTenant(actor.tenantId, async (client) => {
    const found = await repo.findById(client, id);
    if (!found) throw LeaveV2Error.notFound('Leave type');
    return found;
  });
}

export async function updateLeaveType(
  actor: Actor,
  id: string,
  input: UpdateLeaveTypeInput
): Promise<LeaveType> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findById(client, id);
    if (!existing) throw LeaveV2Error.notFound('Leave type');

    if (input.code && (await repo.existsByCode(client, input.code, id))) {
      throw LeaveV2Error.conflict(`A leave type with code "${input.code}" already exists`);
    }

    const updated = await repo.update(client, id, { ...input, updatedBy: actor.userId });
    if (!updated) throw LeaveV2Error.notFound('Leave type');
    return updated;
  });
}

export async function deleteLeaveType(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDelete(client, id, actor.userId);
    if (!ok) throw LeaveV2Error.notFound('Leave type');
  });
}
