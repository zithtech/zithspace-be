// src/modules/payroll/controllers/workflow.controller.ts
// Thin HTTP layer for approval workflows.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/workflow.service';
import { createWorkflowSchema, updateWorkflowSchema } from '../validators/workflow.validator';

export const list = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listWorkflows(actorOf(req), req.query.includeInactive === 'true'));
});
export const getOne = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getWorkflow(actorOf(req), req.params.id));
});
export const create = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.createWorkflow(actorOf(req), createWorkflowSchema.parse(req.body)), 201);
});
export const update = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.updateWorkflow(actorOf(req), req.params.id, updateWorkflowSchema.parse(req.body)));
});
export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteWorkflow(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});
