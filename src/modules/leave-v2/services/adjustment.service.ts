// src/modules/leave-v2/services/adjustment.service.ts
//
// Manual leave-balance adjustments → ledger entries. Each adjustment "kind"
// maps to a ledger entry_type + sign; the units written are signed accordingly.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/adjustment.repo';
import * as leaveTypeRepo from '../repositories/leaveType.repo';
import { Actor, LeaveV2Error } from '../types';
import { CreateAdjustmentInput } from '../validators/adjustment.validator';

// kind → { ledger entry_type, sign, human label }
const KIND_MAP: Record<string, { entryType: string; sign: 1 | -1; label: string }> = {
  credit: { entryType: 'adjustment', sign: 1, label: 'Credit adjustment' },
  debit: { entryType: 'adjustment', sign: -1, label: 'Debit adjustment' },
  comp_off: { entryType: 'credit', sign: 1, label: 'Comp-off' },
  opening: { entryType: 'opening', sign: 1, label: 'Opening balance' },
  encashment: { entryType: 'encashment', sign: -1, label: 'Encashment' },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function createAdjustment(actor: Actor, input: CreateAdjustmentInput) {
  return withTenant(actor.tenantId, async (client) => {
    const lt = await leaveTypeRepo.findById(client, input.leaveTypeId);
    if (!lt) throw LeaveV2Error.notFound('Leave type');

    const map = KIND_MAP[input.kind];
    const units = map.sign * input.amount;
    const note = input.reason?.trim() ? `${map.label}: ${input.reason.trim()}` : map.label;

    const entry = await repo.insertEntry(client, {
      userId: input.employeeId, // API field `employeeId` carries the user id
      leaveTypeId: input.leaveTypeId,
      entryType: map.entryType,
      units,
      note,
      effectiveDate: input.effectiveDate ?? todayISO(),
      createdBy: actor.userId,
    });

    const newBalance = await repo.getBalanceFor(client, input.employeeId, input.leaveTypeId);
    return { entry, newBalance };
  });
}

export async function listAdjustments(actor: Actor) {
  return withTenant(actor.tenantId, (client) => repo.listAdjustments(client));
}

/** Delete a manual adjustment; the resulting balance is recomputed from the ledger. */
export async function deleteAdjustment(actor: Actor, id: string) {
  return withTenant(actor.tenantId, async (client) => {
    const deleted = await repo.deleteEntry(client, id);
    if (!deleted) throw LeaveV2Error.notFound('Adjustment');
    const newBalance = await repo.getBalanceFor(client, deleted.userId, deleted.leaveTypeId);
    return { id, deleted: true, newBalance };
  });
}

export async function getEmployeeOptions(actor: Actor) {
  return withTenant(actor.tenantId, (client) => repo.listEmployees(client));
}

export async function getBalance(actor: Actor, employeeId: string, leaveTypeId: string) {
  return withTenant(actor.tenantId, async (client) => ({
    available: await repo.getBalanceFor(client, employeeId, leaveTypeId),
  }));
}
