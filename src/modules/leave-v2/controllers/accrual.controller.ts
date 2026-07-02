// src/modules/leave-v2/controllers/accrual.controller.ts
// Manual accrual trigger (for testing/admin) + leave-year settings.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import { LeaveV2Error } from '../types';
import * as accrual from '../services/accrual.service';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

export const getSettings = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await accrual.getLeaveSettings(actorOf(req)));
});

export const updateSettings = handle(async (req: AuthRequest, res: Response) => {
  const month = Number(req.body?.leaveYearStartMonth);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw LeaveV2Error.badRequest('leaveYearStartMonth must be an integer 1–12');
  }
  const actor = actorOf(req);
  const before = await accrual.getLeaveSettings(actor);
  const result = await accrual.setLeaveYearStartMonth(actor, month);
  if (before.leaveYearStartMonth !== result.leaveYearStartMonth) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.LEAVES,
      page: Page.LEAVE_ACCRUAL,
      action: Action.UPDATE,
      actionLabel: `Changed leave-year start month to ${result.leaveYearStartMonth}`,
      entityType: EntityType.LEAVE_SETTINGS,
      entityLabel: 'Leave-year start month',
      beforeData: { leaveYearStartMonth: before.leaveYearStartMonth },
      afterData: { leaveYearStartMonth: result.leaveYearStartMonth },
      changedFields: ['leaveYearStartMonth'],
    });
  }
  ok(res, result);
});

/** Run accrual for the caller's tenant for a given month (defaults to now). */
export const run = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  let asOf: { year: number; month: number } | undefined;
  if (req.body?.year || req.body?.month) {
    const year = Number(req.body.year);
    const month = Number(req.body.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw LeaveV2Error.badRequest('year and month (1–12) must be valid integers');
    }
    asOf = { year, month };
  }
  const dryRun = req.body?.dryRun === true || req.query?.dryRun === 'true';
  const result = await accrual.runAccrualForTenant(tenantId, asOf, { dryRun });
  // Only real runs mutate the ledger — dry-runs are previews and not logged.
  if (!dryRun) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.LEAVES,
      page: Page.LEAVE_ACCRUAL,
      action: Action.RUN,
      actionLabel: `Ran leave accrual for ${result.year}-${String(result.month).padStart(2, '0')}: credited ${result.credited}, skipped ${result.skipped}`,
      entityType: EntityType.LEAVE_ACCRUAL_RUN,
      entityId: `${result.year}-${String(result.month).padStart(2, '0')}`,
      entityLabel: `Accrual ${result.year}-${String(result.month).padStart(2, '0')}`,
      afterData: {
        year: result.year,
        month: result.month,
        employees: result.employees,
        policies: result.policies,
        credited: result.credited,
        skipped: result.skipped,
      },
      metadata: { byLeaveType: result.byLeaveType },
    });
  }
  ok(res, result);
});
