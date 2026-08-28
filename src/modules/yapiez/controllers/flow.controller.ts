// src/modules/yapiez/controllers/flow.controller.ts
// Flows and their steps — QA's ordered composition of catalog APIs.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import * as repo from '../repositories/flow.repo';
import * as catalogRepo from '../repositories/catalog.repo';
import * as environmentRepo from '../repositories/environment.repo';
import { actorOf, handle, ok, okList, paging } from '../http';
import {
  flowCreateSchema,
  flowUpdateSchema,
  reorderSchema,
  stepCreateSchema,
  stepUpdateSchema,
} from '../validators';
import { previewRequest } from '../services/requestBuilder';
import { StepOverrides, YapiezError } from '../types';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const { page, pageSize, offset } = paging(req.query as any);
  const { items, total } = await withTenant(tenantId, (c) =>
    repo.listFlows(
      c,
      {
        search: req.query.search as string,
        scopeId: req.query.scopeId as string,
        projectId: req.query.projectId as string,
        status: req.query.status as string,
        environmentId: req.query.environmentId as string,
      },
      { limit: pageSize, offset }
    )
  );
  okList(res, items, { total, page, pageSize });
});

export const get = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => repo.getFlow(c, req.params.id));
  ok(res, data);
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = flowCreateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.createFlow(c, userId, input));
  ok(res, data, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = flowUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.updateFlow(c, userId, req.params.id, input));
  ok(res, data);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  await withTenant(tenantId, (c) => repo.deleteFlow(c, req.params.id));
  ok(res, { id: req.params.id });
});

export const duplicate = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw YapiezError.badRequest('Give the copy a name.');
  const data = await withTenant(tenantId, (c) => repo.duplicateFlow(c, userId, req.params.id, name));
  ok(res, data, 201);
});

// ─── Steps ──────────────────────────────────────────────────────────────────

export const listSteps = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => repo.listSteps(c, req.params.id));
  ok(res, data);
});

export const addStep = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const input = stepCreateSchema.parse(req.body);
  const data = await withTenant(tenantId, async (c) => {
    // Fail early with a clear message rather than on the FK.
    await catalogRepo.getApi(c, input.apiId);
    return repo.addStep(c, req.params.id, input);
  });
  ok(res, data, 201);
});

export const updateStep = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const input = stepUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.updateStep(c, req.params.id, req.params.stepId, input));
  ok(res, data);
});

export const removeStep = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  await withTenant(tenantId, (c) => repo.deleteStep(c, req.params.id, req.params.stepId));
  ok(res, { id: req.params.stepId });
});

export const reorderSteps = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const { stepIds } = reorderSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.reorderSteps(c, req.params.id, stepIds));
  ok(res, data);
});

/**
 * "What would this step actually send?" — the same builder the runner uses,
 * stopping short of the network. Secrets are masked, and unresolved variables
 * are reported so QA can see a missing {{userId}} before running anything.
 */
export const previewStep = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);

  const data = await withTenant(tenantId, async (c) => {
    const flow = await repo.getFlow(c, req.params.id);
    const step = (flow.steps ?? []).find((s) => s.id === req.params.stepId);
    if (!step) throw YapiezError.notFound('Step');

    const api = await catalogRepo.getApi(c, step.apiId);
    const environmentId = (req.query.environmentId as string) || flow.environmentId;
    const environment = environmentId
      ? await environmentRepo.getEnvironmentForRun(c, environmentId)
      : await environmentRepo.getDefaultEnvironment(c);

    // Preview runs before any execution, so nothing has been extracted yet.
    // Variables that only exist mid-run show up as unresolved — which is the
    // honest answer to "what would this send if I ran only this step?".
    const context: Record<string, unknown> = { baseUrl: environment?.baseUrl };
    const secretKeys: string[] = [];
    for (const variable of environment?.variables ?? []) {
      context[variable.key] = variable.secret ? '••••••••' : variable.value;
      if (variable.secret) secretKeys.push(variable.key);
    }

    const built = previewRequest({
      api,
      overrides: step.overrides as StepOverrides,
      baseUrl: environment?.baseUrl ?? null,
      context,
      authHeader: flow.authApiId ? { name: 'Authorization', value: 'Bearer {{accessToken}}' } : null,
    });

    return {
      method: built.method,
      url: built.url,
      headers: built.headers,
      query: built.query,
      body: built.body ?? null,
      bodyType: built.bodyType,
      unresolvedVariables: built.missingVariables,
      environment: environment ? { id: environment.id, name: environment.name } : null,
    };
  });

  ok(res, data);
});
