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
  const page = req.query.page ? Math.max(1, Number(req.query.page)) : 1;
  const limit = req.query.limit ? Math.max(1, Number(req.query.limit)) : 15;
  const data = await service.getRegister(actorOf(req), runId, { page, limit });
  res.json({
    success: true,
    data,
    pagination: data.pagination,
  });
});
