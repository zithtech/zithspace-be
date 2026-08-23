// src/modules/payroll/services/schedule.service.ts
//
// Business logic for Pay Schedules. Owns the transaction boundary and the rules
// (code uniqueness, single-default invariant, delete guard).

import { withTenant } from '../db/pool';
import * as repo from '../repositories/schedule.repo';
import { Actor, PaySchedule, PayScheduleListItem, PayrollError } from '../types';
import { CreateScheduleInput, UpdateScheduleInput } from '../validators/schedule.validator';

export async function createSchedule(actor: Actor, input: CreateScheduleInput): Promise<PaySchedule> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsByCode(client, input.code)) {
      throw PayrollError.conflict(`A schedule with code "${input.code}" already exists`);
    }
    // Keep the single-default invariant: clear any existing default first.
    if (input.isDefault) await repo.clearDefault(client);
    return repo.insert(client, {
      name: input.name,
      code: input.code,
      frequency: input.frequency,
      cycleStartDay: input.cycleStartDay,
      cycleEndDay: input.cycleEndDay,
      payDay: input.payDay,
      payInNextMonth: input.payInNextMonth,
      isDefault: input.isDefault,
      description: input.description ?? null,
      isActive: input.isActive,
      createdBy: actor.userId,
    });
  });
}

export async function listSchedules(
  actor: Actor,
  opts: { includeInactive?: boolean; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: PayScheduleListItem[]; total: number }> {
  return withTenant(actor.tenantId, (client) => repo.findAll(client, opts));
}

export async function getSchedule(actor: Actor, id: string): Promise<PaySchedule> {
  return withTenant(actor.tenantId, async (client) => {
    const found = await repo.findById(client, id);
    if (!found) throw PayrollError.notFound('Pay schedule');
    return found;
  });
}

export async function updateSchedule(actor: Actor, id: string, input: UpdateScheduleInput): Promise<PaySchedule> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findById(client, id);
    if (!existing) throw PayrollError.notFound('Pay schedule');
    if (input.code && (await repo.existsByCode(client, input.code, id))) {
      throw PayrollError.conflict(`A schedule with code "${input.code}" already exists`);
    }
    if (input.isDefault === true) await repo.clearDefault(client, id);
    const updated = await repo.update(client, id, { ...input, updatedBy: actor.userId });
    if (!updated) throw PayrollError.notFound('Pay schedule');
    return updated;
  });
}

export async function deleteSchedule(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const groups = await repo.countGroups(client, id);
    if (groups > 0) {
      throw PayrollError.conflict(`This schedule is used by ${groups} pay group(s). Reassign or remove them first.`);
    }
    const ok = await repo.softDelete(client, id, actor.userId);
    if (!ok) throw PayrollError.notFound('Pay schedule');
  });
}
