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
import * as settingsRepo from '../repositories/leaveSettings.repo';
import { Actor, LeaveV2Error } from '../types';
import { ApplyLeaveInput } from '../validators/leaveRequest.validator';
import { EmailService } from '@/utils/emailService';

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

    // -- Mail Sending Logic --
    try {
      const userQuery = await client.query(`
        SELECT 
          u.name as employee_name, 
          u.work_email as employee_email,
          m.name as manager_name,
          m.work_email as manager_email
        FROM users u
        LEFT JOIN users m ON u.reports_to_id = m.id
        WHERE u.id = $1
      `, [userId]);
      const uData = userQuery.rows[0];

      if (uData) {
        const mailConfig = await settingsRepo.getSettings(client, actor.tenantId);
        
        // 3) Determine Reply-To email
        let replyToEmail = uData.employee_email;
        if (mailConfig.replyToMode === 'custom' && mailConfig.customReplyToEmail) {
          replyToEmail = mailConfig.customReplyToEmail;
        }

        const toEmails = new Set<string>();
        if (mailConfig.reportsToEnabled && uData.manager_email) {
          toEmails.add(uData.manager_email);
        }
        mailConfig.additionalToEmails?.forEach(e => toEmails.add(e));
        mailConfig.customToEmails?.forEach(e => toEmails.add(e));

        const ccEmails = new Set<string>();
        if (mailConfig.officeCcEnabled) {
          ccEmails.add('owner@zithtech.com');
        }
        mailConfig.additionalCcEmails?.forEach(e => ccEmails.add(e));
        mailConfig.customCcEmails?.forEach(e => ccEmails.add(e));

        if (toEmails.size > 0) {
          const emailService = new EmailService();
          emailService.sendLeaveApplicationEmail({
            to: Array.from(toEmails).join(','),
            cc: ccEmails.size > 0 ? Array.from(ccEmails).join(',') : undefined,
            replyTo: replyToEmail,
            managerName: uData.manager_name || 'Manager',
            employeeName: uData.employee_name,
            employeeEmail: uData.employee_email,
            leaveType: lt.name,
            startDate: input.fromDate,
            endDate: input.toDate,
            duration: units,
            durationType: 'DAYS',
            reason: input.reason || 'No reason provided',
            leaveId: request.id,
          }, actor.tenantId).catch(err => {
            console.error('Failed to send leave application email:', err);
          });
        }
      }
    } catch (mailError) {
      console.error('Error in leave mail logic:', mailError);
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

export async function listMyRequests(
  actor: Actor,
  opts?: { page?: number; limit?: number; search?: string; status?: string }
) {
  return withTenant(actor.tenantId, (client) => repo.listForUser(client, actor.userId, opts));
}

/** Active holiday dates (YYYY-MM-DD) — lets the apply-leave preview match the server. */
export async function getHolidayDates(actor: Actor): Promise<string[]> {
  return withTenant(actor.tenantId, (client) => holidayRepo.allActiveHolidayDates(client));
}

export async function cancelMyRequest(actor: Actor, id: string) {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findAnyById(client, id);
    const ok = await repo.cancelOwnPending(client, actor.userId, id, actor.userId);
    if (!ok) throw LeaveV2Error.badRequest('Only your own pending requests can be cancelled');
    return existing; // pre-cancel snapshot, for activity logging
  });
}

// ── Withdrawal of an approved leave (release unused days) ──────────────────────

export interface WithdrawRequestInput {
  /** Release the whole leave — nothing was taken. */
  releaseAll?: boolean;
  /** Shorten the leave to end here (inclusive); the tail after this is released. */
  newToDate?: string | null;
  reason?: string | null;
}

export interface WithdrawalPlan {
  mode: 'full' | 'shorten';
  /** Working days actually taken under the plan. */
  actualUnits: number;
  newToDate: string | null;
  /** total_units − actualUnits (working days released). */
  releasedTotal: number;
  /** Paid days released — the amount credited back to the ledger. */
  releasedPaid: number;
  /** LOP days released — no ledger impact (they were never debited). */
  releasedLop: number;
  /** Paid/LOP split of the KEPT portion (the new request figures). */
  newPaid: number;
  newLop: number;
}

/**
 * Work out what a withdrawal releases. The original debit was only paid_units,
 * so we release LOP days first (no balance impact) and credit the ledger for the
 * released PAID days only — never over-crediting a partly-LOP leave.
 */
export async function computeWithdrawalPlan(
  client: any,
  req: repo.LeaveRequestRow,
  input: WithdrawRequestInput
): Promise<WithdrawalPlan> {
  let mode: 'full' | 'shorten';
  let actualUnits: number;
  let newToDate: string | null = null;

  if (input.releaseAll || !input.newToDate) {
    mode = 'full';
    actualUnits = 0;
  } else {
    if (input.newToDate < req.fromDate || input.newToDate >= req.toDate) {
      throw LeaveV2Error.badRequest('The new end date must fall within the leave and before its current end date');
    }
    const holidays = await holidayRepo.holidayDatesInRange(client, req.fromDate, input.newToDate);
    actualUnits = computeUnits(req.fromDate, input.newToDate, req.dayPortion, holidays);
    if (actualUnits <= 0) {
      // Kept range has no working days → effectively a full release.
      mode = 'full';
      actualUnits = 0;
    } else {
      mode = 'shorten';
      newToDate = input.newToDate;
    }
  }

  const releasedTotal = Number((req.totalUnits - actualUnits).toFixed(2));
  if (releasedTotal <= 0) {
    throw LeaveV2Error.badRequest('This plan releases no days');
  }
  const releasedLop = Math.min(releasedTotal, req.lopUnits);
  const releasedPaid = Number((releasedTotal - releasedLop).toFixed(2));
  const newPaid = Number((req.paidUnits - releasedPaid).toFixed(2));
  const newLop = Number((req.lopUnits - releasedLop).toFixed(2));

  return { mode, actualUnits, newToDate, releasedTotal, releasedPaid, releasedLop, newPaid, newLop };
}

/** Employee submits a withdrawal request on their own approved leave. */
export async function requestWithdrawal(actor: Actor, id: string, input: WithdrawRequestInput) {
  return withTenant(actor.tenantId, async (client) => {
    const req = await repo.findAnyById(client, id);
    if (!req || req.userId !== actor.userId) throw LeaveV2Error.notFound('Leave request');
    if (req.status !== 'approved') throw LeaveV2Error.badRequest('Only approved leave can be withdrawn');
    if (req.withdrawalStatus === 'requested') throw LeaveV2Error.badRequest('A withdrawal request is already awaiting your manager');

    const plan = await computeWithdrawalPlan(client, req, input);

    const updated = await repo.requestWithdrawal(client, actor.userId, id, {
      requestedUnits: plan.releasedTotal,
      newToDate: plan.newToDate,
      reason: input.reason ?? null,
      actorId: actor.userId,
    });
    if (!updated) throw LeaveV2Error.badRequest('This leave can no longer be withdrawn');

    return { before: req, request: updated, plan };
  });
}
