// src/modules/leave-v2/controllers/accrual.controller.ts
// Manual accrual trigger (for testing/admin) + leave-year settings.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import { LeaveV2Error } from '../types';
import * as accrual from '../services/accrual.service';

export const getSettings = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await accrual.getLeaveSettings(actorOf(req)));
});

export const updateSettings = handle(async (req: AuthRequest, res: Response) => {
  const month = Number(req.body?.leaveYearStartMonth);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw LeaveV2Error.badRequest('leaveYearStartMonth must be an integer 1–12');
  }
  ok(res, await accrual.setLeaveYearStartMonth(actorOf(req), month));
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
  ok(res, result);
});
