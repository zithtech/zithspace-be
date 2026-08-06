// src/modules/opening-management/controllers/dashboard.controller.ts
// Thin HTTP layer for the Phase 6 hiring dashboard. Read-only throughout, so
// nothing here records transaction history.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/dashboard.service';
import {
  dashboardFilterSchema,
  dashboardListQuerySchema,
} from '../validators/dashboard.validator';

export const overview = handle(async (req: AuthRequest, res: Response) => {
  const query = dashboardListQuerySchema.parse(req.query);
  ok(res, await service.getOverview(actorOf(req), query));
});

export const summary = handle(async (req: AuthRequest, res: Response) => {
  const query = dashboardFilterSchema.parse(req.query);
  ok(res, await service.getSummary(actorOf(req), query));
});

export const openings = handle(async (req: AuthRequest, res: Response) => {
  const query = dashboardListQuerySchema.parse(req.query);
  ok(res, await service.getOpeningMetrics(actorOf(req), query));
});

export const sources = handle(async (req: AuthRequest, res: Response) => {
  const query = dashboardFilterSchema.parse(req.query);
  ok(res, await service.getSourceEffectiveness(actorOf(req), query));
});

export const velocity = handle(async (req: AuthRequest, res: Response) => {
  const query = dashboardFilterSchema.parse(req.query);
  ok(res, await service.getStageVelocity(actorOf(req), query));
});

export const recruiters = handle(async (req: AuthRequest, res: Response) => {
  const query = dashboardFilterSchema.parse(req.query);
  ok(res, await service.getRecruiterLoad(actorOf(req), query));
});
