// src/modules/performance-report/controllers/generated.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/generated.service';
import { saveGeneratedSchema, listGeneratedQuerySchema } from '../validators/generated.validator';
import { PerfReportError } from '../types';

export const save = handle(async (req: AuthRequest, res: Response) => {
  const input = saveGeneratedSchema.parse(req.body);
  const report = await service.saveGenerated(actorOf(req), input);
  ok(res, report, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { period } = listGeneratedQuerySchema.parse(req.query);
  const result = await service.listGenerated(actorOf(req), period);
  ok(res, result);
});

export const mine = handle(async (req: AuthRequest, res: Response) => {
  const reports = await service.listMine(actorOf(req));
  ok(res, reports);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const okDel = await service.deleteGenerated(actorOf(req), req.params.id);
  if (!okDel) throw PerfReportError.notFound('Generated report');
  ok(res, { id: req.params.id, deleted: true });
});
