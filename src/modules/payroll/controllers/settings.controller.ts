// src/modules/payroll/controllers/settings.controller.ts
// Thin HTTP layer: validate input → call service → shape response.
// No business logic here.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/settings.service';
import { updateSettingsSchema } from '../validators/settings.validator';

export const get = handle(async (req: AuthRequest, res: Response) => {
  const settings = await service.getSettings(actorOf(req));
  ok(res, settings);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateSettingsSchema.parse(req.body);
  const settings = await service.updateSettings(actorOf(req), input);
  ok(res, settings);
});
