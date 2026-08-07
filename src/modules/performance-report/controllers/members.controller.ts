// src/modules/performance-report/controllers/members.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/members.service';
import { memberListQuerySchema } from '../validators/members.validator';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const query = memberListQuerySchema.parse(req.query);
  const result = await service.listMembers(actorOf(req), query);
  ok(res, result);
});

export const filterOptions = handle(async (req: AuthRequest, res: Response) => {
  const result = await service.listFilterOptions(actorOf(req));
  ok(res, result);
});
