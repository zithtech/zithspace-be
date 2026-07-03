// src/modules/reimbursement-v2/controllers/report.controller.ts
// Read-only dashboard endpoints. Accepts optional ?from=&to= (YYYY-MM-DD).

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { z } from 'zod';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/report.service';

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
});

function rangeOf(req: AuthRequest) {
  return rangeSchema.parse({ from: req.query.from, to: req.query.to });
}

export const summary = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.summary(actorOf(req), rangeOf(req)));
});

export const byCategory = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.byCategory(actorOf(req), rangeOf(req)));
});

export const byUser = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.byUser(actorOf(req), rangeOf(req)));
});
