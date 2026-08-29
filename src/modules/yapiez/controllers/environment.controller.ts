// src/modules/yapiez/controllers/environment.controller.ts
// Environments — {{baseUrl}} and the credentials a flow starts from.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import * as repo from '../repositories/environment.repo';
import { actorOf, handle, ok } from '../http';
import { environmentCreateSchema, environmentUpdateSchema } from '../validators';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) =>
    repo.listEnvironments(c, { projectId: req.query.projectId as string })
  );
  ok(res, data);
});

export const get = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => repo.getEnvironment(c, req.params.id));
  ok(res, data);
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = environmentCreateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.createEnvironment(c, userId, input));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_ENVIRONMENT_SETTINGS,
    action: Action.CREATE,
    entityType: EntityType.API_ENVIRONMENT,
    entityId: data.id,
    entityLabel: data.name,
  });

  ok(res, data, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = environmentUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.updateEnvironment(c, userId, req.params.id, input));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_ENVIRONMENT_SETTINGS,
    action: Action.UPDATE,
    entityType: EntityType.API_ENVIRONMENT,
    entityId: data.id,
    entityLabel: data.name,
  });

  ok(res, data);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  await withTenant(tenantId, (c) => repo.deleteEnvironment(c, req.params.id));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_ENVIRONMENT_SETTINGS,
    action: Action.DELETE,
    entityType: EntityType.API_ENVIRONMENT,
    entityId: req.params.id,
  });

  ok(res, { id: req.params.id });
});
