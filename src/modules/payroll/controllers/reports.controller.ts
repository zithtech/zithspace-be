// src/modules/payroll/controllers/reports.controller.ts
// Thin HTTP layer for payroll reports.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/reports.service';
import { PayrollError } from '../types';

export const register = handle(async (req: AuthRequest, res: Response) => {
  const runId = req.query.runId as string;
  if (!runId) throw PayrollError.badRequest('runId is required');
  ok(res, await service.getRegister(actorOf(req), runId));
});
