// src/modules/performance-report/controllers/generated.controller.ts
import { AuthRequest } from '@/types';
import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";

import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/generated.service';
import { saveGeneratedSchema, listGeneratedQuerySchema } from '../validators/generated.validator';
import { PerfReportError } from '../types';

export const save = handle(async (req: AuthRequest, res: Response) => {
  const input = saveGeneratedSchema.parse(req.body);
  const report = await service.saveGenerated(actorOf(req), input);

  recordTransaction({
    req,
    section: Section.HR,
    module: Module.PERFORMANCE_REPORT,
    page: Page.PERFORMANCE_REPORT,
    action: Action.CREATE,
    actionLabel: `Generated performance report for ${req.user.name}`,
    entityType: EntityType.PERFORMANCE_REPORT,
    entityId: report.id,
    afterData: report,
    statusCode: 201,
  });

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

  recordTransaction({
    req,
    section: Section.HR,
    module: Module.PERFORMANCE_REPORT,
    page: Page.PERFORMANCE_REPORT,
    action: Action.DELETE,
    actionLabel: "Deleted performance report",
    entityType: EntityType.PERFORMANCE_REPORT,
    entityId: req.params.id,
    statusCode: 200,
  });

  ok(res, { id: req.params.id, deleted: true });
});
