// src/modules/payroll/controllers/statutoryState.controller.ts
// Thin HTTP layer for Professional Tax (state + slabs) and LWF (per state).

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/statutoryState.service';
import {
  createPtStateSchema,
  updatePtStateSchema,
  createLwfStateSchema,
  updateLwfStateSchema,
} from '../validators/statutoryState.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

// ── Professional Tax ─────────────────────────────────────────────────────────
export const listPt = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listPtStates(actorOf(req), req.query.includeInactive === 'true'));
});
export const getPt = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getPtState(actorOf(req), req.params.id));
});
export const createPt = handle(async (req: AuthRequest, res: Response) => {
  const pt = await service.createPtState(actorOf(req), createPtStateSchema.parse(req.body));
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PT_LWF,
    action: Action.CREATE,
    actionLabel: `Created PT configuration for state`,
    entityType: EntityType.PAYROLL_STATUTORY_STATE,
    entityId: pt.id,
  });
  ok(res, pt, 201);
});
export const updatePt = handle(async (req: AuthRequest, res: Response) => {
  const pt = await service.updatePtState(actorOf(req), req.params.id, updatePtStateSchema.parse(req.body));
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PT_LWF,
    action: Action.UPDATE,
    actionLabel: `Updated PT configuration for state`,
    entityType: EntityType.PAYROLL_STATUTORY_STATE,
    entityId: pt.id,
  });
  ok(res, pt);
});
export const removePt = handle(async (req: AuthRequest, res: Response) => {
  await service.deletePtState(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PT_LWF,
    action: Action.DELETE,
    actionLabel: `Deleted PT configuration for state`,
    entityType: EntityType.PAYROLL_STATUTORY_STATE,
    entityId: req.params.id,
  });
  ok(res, { id: req.params.id, deleted: true });
});

// ── LWF ──────────────────────────────────────────────────────────────────────
export const listLwf = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listLwf(actorOf(req), req.query.includeInactive === 'true'));
});
export const createLwf = handle(async (req: AuthRequest, res: Response) => {
  const lwf = await service.createLwf(actorOf(req), createLwfStateSchema.parse(req.body));
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PT_LWF,
    action: Action.CREATE,
    actionLabel: `Created LWF configuration for state`,
    entityType: EntityType.PAYROLL_STATUTORY_STATE,
    entityId: lwf.id,
  });
  ok(res, lwf, 201);
});
export const updateLwf = handle(async (req: AuthRequest, res: Response) => {
  const lwf = await service.updateLwf(actorOf(req), req.params.id, updateLwfStateSchema.parse(req.body));
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PT_LWF,
    action: Action.UPDATE,
    actionLabel: `Updated LWF configuration for state`,
    entityType: EntityType.PAYROLL_STATUTORY_STATE,
    entityId: lwf.id,
  });
  ok(res, lwf);
});
export const removeLwf = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteLwf(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PT_LWF,
    action: Action.DELETE,
    actionLabel: `Deleted LWF configuration for state`,
    entityType: EntityType.PAYROLL_STATUTORY_STATE,
    entityId: req.params.id,
  });
  ok(res, { id: req.params.id, deleted: true });
});
