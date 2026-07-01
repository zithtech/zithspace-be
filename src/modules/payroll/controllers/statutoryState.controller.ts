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

// ── Professional Tax ─────────────────────────────────────────────────────────
export const listPt = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listPtStates(actorOf(req), req.query.includeInactive === 'true'));
});
export const getPt = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getPtState(actorOf(req), req.params.id));
});
export const createPt = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.createPtState(actorOf(req), createPtStateSchema.parse(req.body)), 201);
});
export const updatePt = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.updatePtState(actorOf(req), req.params.id, updatePtStateSchema.parse(req.body)));
});
export const removePt = handle(async (req: AuthRequest, res: Response) => {
  await service.deletePtState(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});

// ── LWF ──────────────────────────────────────────────────────────────────────
export const listLwf = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listLwf(actorOf(req), req.query.includeInactive === 'true'));
});
export const createLwf = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.createLwf(actorOf(req), createLwfStateSchema.parse(req.body)), 201);
});
export const updateLwf = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.updateLwf(actorOf(req), req.params.id, updateLwfStateSchema.parse(req.body)));
});
export const removeLwf = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteLwf(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});
