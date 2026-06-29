// src/modules/leave-v2/services/leaveRequest.service.ts
//
// Self-service leave: apply, view balances, list own requests, cancel.
// Leave keys on the user (actor.userId). Balances are derived from the ledger;
// approval (and its ledger debit) for requests that need it lives in the
// Approvals slice. Leave types that don't require approval are auto-approved
// here and debit immediately.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/leaveRequest.repo';
import * as leaveTypeRepo from '../repositories/leaveType.repo';
import * as holidayRepo from '../repositories/holiday.repo';
import { Actor, LeaveV2Error } from '../types';
import { ApplyLeaveInput } from '../validators/leaveRequest.validator';

/**
 * Working-day units in [from, to]: excludes weekends AND holidays.
 * Half-day → 0.5 (only on a working, non-holiday day).
 */
export function computeUnits(fromDate: string, toDate: string, dayPortion: string, holidays: Set<string> = new Set()): number {
  if (dayPortion !== 'full') {
    const dow = new Date(`${fromDate}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || holidays.has(fromDate)) return 0; // half-day must be a working, non-holiday day
    return 0.5;
  }
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  let units = 0;
  for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay(); // 0 Sun … 6 Sat
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) units += 1;
  }
  return units;
}

export async function applyLeave(actor: Actor, input: ApplyLeaveInput) {
  const userId = actor.userId;
  return withTenant(actor.tenantId, async (client) => {
    const lt = await leaveTypeRepo.findById(client, input.leaveTypeId);
    if (!lt || !lt.isActive) throw LeaveV2Error.notFound('Leave type');

    const holidays = await holidayRepo.holidayDatesInRange(client, input.fromDate, input.toDate);
    const units = computeUnits(input.fromDate, input.toDate, input.dayPortion, holidays);
    if (units <= 0) throw LeaveV2Error.badRequest('The selected range has no working days (weekends/holidays only)');

    if (await repo.overlapExists(client, userId, input.fromDate, input.toDate)) {
      throw LeaveV2Error.conflict('You already have a leave request overlapping these dates');
    }

    // LOP split against current balance.
    const balance = await repo.getBalanceFor(client, userId, input.leaveTypeId);
    const paid = Math.min(units, Math.max(balance, 0));
    const lop = Number((units - paid).toFixed(2));

    const status: 'pending' | 'approved' = lt.requiresApproval ? 'pending' : 'approved';

    const request = await repo.insertRequest(client, {
      userId,
      leaveTypeId: input.leaveTypeId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      dayPortion: input.dayPortion,
      totalUnits: units,
      paidUnits: paid,
      lopUnits: lop,
      reason: input.reason ?? null,
      status,
      approverId: status === 'approved' ? actor.userId : null,
      createdBy: actor.userId,
    });

    // Auto-approved → debit the paid portion immediately (LOP portion never debits).
    if (status === 'approved' && paid > 0) {
      await repo.insertLeaveDebit(client, {
        userId,
        leaveTypeId: input.leaveTypeId,
        units: paid,
        requestId: request.id,
        effectiveDate: input.fromDate,
        createdBy: actor.userId,
      });
    }

    return request;
  });
}

export async function updateMyRequest(actor: Actor, id: string, input: ApplyLeaveInput) {
  const userId = actor.userId;
  return withTenant(actor.tenantId, async (client) => {
    const req = await repo.findAnyById(client, id);
    if (!req || req.userId !== userId) throw LeaveV2Error.notFound('Leave request');
    if (req.status !== 'pending') throw LeaveV2Error.badRequest('Only pending requests can be edited');

    const lt = await leaveTypeRepo.findById(client, input.leaveTypeId);
    if (!lt || !lt.isActive) throw LeaveV2Error.notFound('Leave type');

    const holidays = await holidayRepo.holidayDatesInRange(client, input.fromDate, input.toDate);
    const units = computeUnits(input.fromDate, input.toDate, input.dayPortion ?? 'full', holidays);
    if (units <= 0) throw LeaveV2Error.badRequest('The selected range has no working days (weekends/holidays only)');

    if (await repo.overlapExists(client, userId, input.fromDate, input.toDate, id)) {
      throw LeaveV2Error.conflict('You already have a leave request overlapping these dates');
    }

    const balance = await repo.getBalanceFor(client, userId, input.leaveTypeId);
    const paid = Math.min(units, Math.max(balance, 0));
    const lop = Number((units - paid).toFixed(2));

    const status: 'pending' | 'approved' = lt.requiresApproval ? 'pending' : 'approved';

    const updated = await repo.updateRequest(client, id, {
      userId,
      leaveTypeId: input.leaveTypeId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      dayPortion: input.dayPortion ?? 'full',
      totalUnits: units,
      paidUnits: paid,
      lopUnits: lop,
      reason: input.reason ?? null,
      status,
      approverId: status === 'approved' ? actor.userId : null,
      createdBy: actor.userId,
    });

    if (status === 'approved' && paid > 0) {
      await repo.insertLeaveDebit(client, {
        userId,
        leaveTypeId: input.leaveTypeId,
        units: paid,
        requestId: updated.id,
        effectiveDate: input.fromDate,
        createdBy: actor.userId,
      });
    }

    return updated;
  });
}

export interface BalanceItem {
  leaveTypeId: string;
  name: string;
  code: string;
  color: string | null;
  unit: string;
  isPaid: boolean;
  available: number;
  credited: number;
  used: number;
}

export async function getMyBalances(actor: Actor): Promise<BalanceItem[]> {
  return withTenant(actor.tenantId, async (client) => {
    const types = await leaveTypeRepo.findAll(client, { includeInactive: false });
    const balances = await repo.getBalances(client, actor.userId);
    const byType = new Map(balances.map((b) => [b.leaveTypeId, b]));
    return types.map((t) => {
      const b = byType.get(t.id);
      return {
        leaveTypeId: t.id,
        name: t.name,
        code: t.code,
        color: t.color,
        unit: t.unit,
        isPaid: t.isPaid,
        available: b?.available ?? 0,
        credited: b?.credited ?? 0,
        used: b?.used ?? 0,
      };
    });
  });
}

export async function listMyRequests(actor: Actor) {
  return withTenant(actor.tenantId, (client) => repo.listForUser(client, actor.userId));
}

/** Active holiday dates (YYYY-MM-DD) — lets the apply-leave preview match the server. */
export async function getHolidayDates(actor: Actor): Promise<string[]> {
  return withTenant(actor.tenantId, (client) => holidayRepo.allActiveHolidayDates(client));
}

export async function cancelMyRequest(actor: Actor, id: string) {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.cancelOwnPending(client, actor.userId, id, actor.userId);
    if (!ok) throw LeaveV2Error.badRequest('Only your own pending requests can be cancelled');
  });
}
