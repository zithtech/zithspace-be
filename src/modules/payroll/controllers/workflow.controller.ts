// src/modules/payroll/controllers/workflow.controller.ts
// Thin HTTP layer for approval workflows.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/workflow.service';
import { createWorkflowSchema, updateWorkflowSchema } from '../validators/workflow.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const search = req.query.search ? String(req.query.search) : undefined;

  const { data, total } = await service.listWorkflows(actorOf(req), { includeInactive, page, limit, search });
  res.json({
    success: true,
    data,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});
export const getOne = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getWorkflow(actorOf(req), req.params.id));
});
export const create = handle(async (req: AuthRequest, res: Response) => {
  const wf = await service.createWorkflow(actorOf(req), createWorkflowSchema.parse(req.body));
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_APPROVAL_WORKFLOWS,
    action: Action.CREATE,
    actionLabel: `Created payroll approval workflow "${wf.name}"`,
    entityType: EntityType.PAYROLL_WORKFLOW,
    entityId: wf.id,
    entityLabel: wf.name,
  });
  ok(res, wf, 201);
});
export const update = handle(async (req: AuthRequest, res: Response) => {
  const wf = await service.updateWorkflow(actorOf(req), req.params.id, updateWorkflowSchema.parse(req.body));
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_APPROVAL_WORKFLOWS,
    action: Action.UPDATE,
    actionLabel: `Updated payroll approval workflow "${wf.name}"`,
    entityType: EntityType.PAYROLL_WORKFLOW,
    entityId: wf.id,
    entityLabel: wf.name,
  });
  ok(res, wf);
});
export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteWorkflow(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_APPROVAL_WORKFLOWS,
    action: Action.DELETE,
    actionLabel: `Deleted payroll approval workflow`,
    entityType: EntityType.PAYROLL_WORKFLOW,
    entityId: req.params.id,
  });
  ok(res, { id: req.params.id, deleted: true });
});
