// src/modules/payroll/controllers/statutory.controller.ts
// Thin HTTP layer for statutory PF & ESI config.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/statutory.service';
import { updatePfSchema, updateEsiSchema } from '../validators/statutory.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

export const getPf = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getPf(actorOf(req)));
});

export const updatePf = handle(async (req: AuthRequest, res: Response) => {
  const input = updatePfSchema.parse(req.body);
  const pf = await service.updatePf(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_STATUTORY,
    action: Action.UPDATE,
    actionLabel: `Updated statutory PF settings`,
    entityType: EntityType.PAYROLL_STATUTORY,
    entityId: actorOf(req).tenantId,
  });
  ok(res, pf);
});

export const getEsi = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getEsi(actorOf(req)));
});

export const updateEsi = handle(async (req: AuthRequest, res: Response) => {
  const input = updateEsiSchema.parse(req.body);
  const esi = await service.updateEsi(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_STATUTORY,
    action: Action.UPDATE,
    actionLabel: `Updated statutory ESI settings`,
    entityType: EntityType.PAYROLL_STATUTORY,
    entityId: actorOf(req).tenantId,
  });
  ok(res, esi);
});
