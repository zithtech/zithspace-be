// src/modules/payroll/controllers/statutory.controller.ts
// Thin HTTP layer for statutory PF & ESI config.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/statutory.service';
import { updatePfSchema, updateEsiSchema } from '../validators/statutory.validator';

export const getPf = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getPf(actorOf(req)));
});

export const updatePf = handle(async (req: AuthRequest, res: Response) => {
  const input = updatePfSchema.parse(req.body);
  ok(res, await service.updatePf(actorOf(req), input));
});

export const getEsi = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getEsi(actorOf(req)));
});

export const updateEsi = handle(async (req: AuthRequest, res: Response) => {
  const input = updateEsiSchema.parse(req.body);
  ok(res, await service.updateEsi(actorOf(req), input));
});
