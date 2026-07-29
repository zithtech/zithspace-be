// src/modules/performance-report/controllers/settings.controller.ts
// Thin HTTP layer: validate input → call service → shape response.
// No business logic here.

import { AuthRequest } from '@/types';
import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";

import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/settings.service';
import { updateSettingsSchema } from '../validators/settings.validator';
import { MODULE_KEYS, MODULE_LABELS } from '../types';

export const get = handle(async (req: AuthRequest, res: Response) => {
  const settings = await service.getSettings(actorOf(req));
  ok(res, settings);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateSettingsSchema.parse(req.body);
  const settings = await service.updateSettings(actorOf(req), input);
  ok(res, settings);
});

/**
 * Static catalog of the scoring modules (key + label). Lets the FE render the
 * module list / labels without hardcoding them.
 */
export const catalog = handle(async (_req: AuthRequest, res: Response) => {
  ok(
    res,
    MODULE_KEYS.map((key) => ({ moduleKey: key, label: MODULE_LABELS[key] }))
  );
});

/** Distinct ticket statuses in use (for the Tickets status-marks editor). */
export const ticketStatuses = handle(async (req: AuthRequest, res: Response) => {
  const statuses = await service.listTicketStatuses(actorOf(req));
  ok(res, statuses);
});
