// src/modules/performance-report/controllers/reports.controller.ts
// Thin HTTP layer: validate query → call service → shape response.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/reports.service';
import { ticketReportQuerySchema, leaveReportQuerySchema } from '../validators/reports.validator';

export const tickets = handle(async (req: AuthRequest, res: Response) => {
  const query = ticketReportQuerySchema.parse(req.query);
  const rows = await service.getTicketReport(actorOf(req), query);
  ok(res, rows);
});

export const leaves = handle(async (req: AuthRequest, res: Response) => {
  const query = leaveReportQuerySchema.parse(req.query);
  const rows = await service.getLeaveReport(actorOf(req), query);
  ok(res, rows);
});
