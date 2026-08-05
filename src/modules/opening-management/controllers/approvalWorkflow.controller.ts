// src/modules/opening-management/controllers/approvalWorkflow.controller.ts
// Thin HTTP layer for the tenant-level approval templates.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/approvalWorkflow.service';
import { createWorkflowSchema, updateWorkflowSchema } from '../validators/approval.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  ok(res, await service.listWorkflows(actorOf(req), includeInactive));
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getWorkflow(actorOf(req), req.params.workflowId));
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createWorkflowSchema.parse(req.body);
  const wf = await service.createWorkflow(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_APPROVAL_WORKFLOWS,
    action: Action.CREATE,
    actionLabel: `Created opening approval workflow "${wf.name}" (${wf.steps.length} step(s))`,
    entityType: EntityType.OPENING_APPROVAL_WORKFLOW,
    entityId: wf.id,
    entityLabel: wf.name,
    afterData: { name: wf.name, isDefault: wf.isDefault, steps: wf.steps.map((s) => s.stepName) },
  });
  ok(res, wf, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateWorkflowSchema.parse(req.body);
  const wf = await service.updateWorkflow(actorOf(req), req.params.workflowId, input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_APPROVAL_WORKFLOWS,
    action: Action.UPDATE,
    actionLabel: `Updated opening approval workflow "${wf.name}"`,
    entityType: EntityType.OPENING_APPROVAL_WORKFLOW,
    entityId: wf.id,
    entityLabel: wf.name,
    afterData: { name: wf.name, isDefault: wf.isDefault, steps: wf.steps.map((s) => s.stepName) },
  });
  ok(res, wf);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getWorkflow(actor, req.params.workflowId);
  await service.deleteWorkflow(actor, req.params.workflowId);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_APPROVAL_WORKFLOWS,
    action: Action.DELETE,
    actionLabel: `Deleted opening approval workflow "${existing.name}"`,
    entityType: EntityType.OPENING_APPROVAL_WORKFLOW,
    entityId: req.params.workflowId,
    entityLabel: existing.name,
  });
  ok(res, { id: req.params.workflowId, deleted: true });
});
