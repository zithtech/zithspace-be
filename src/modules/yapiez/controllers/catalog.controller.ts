// src/modules/yapiez/controllers/catalog.controller.ts
// Collections + API definitions — what developers publish for QA to reuse.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import * as repo from '../repositories/catalog.repo';
import * as sourceRepo from '../repositories/source.repo';
import * as environmentRepo from '../repositories/environment.repo';
import { tryRequest } from '../services/tryRequest';
import { correctGrammar } from '../services/grammar';
import * as runRepo from '../repositories/run.repo';
import { actorOf, handle, ok, okList, paging } from '../http';
import {
  apiCreateSchema,
  apiUpdateSchema,
  collectionCreateSchema,
  collectionUpdateSchema,
  sourceCreateSchema,
  sourceUpdateSchema,
  tryApiSchema,
  grammarSchema,
} from '../validators';

// ─── Sources — the deployment tier above collections ────────────────────────

export const listSources = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) =>
    sourceRepo.listSources(c, { projectId: req.query.projectId as string })
  );
  ok(res, data);
});

export const createSource = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = sourceCreateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => sourceRepo.createSource(c, userId, input));
  ok(res, data, 201);
});

export const updateSource = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = sourceUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => sourceRepo.updateSource(c, userId, req.params.id, input));
  ok(res, data);
});

export const deleteSource = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  // Collections under it survive as unfiled; the count says how many so the UI
  // can report what actually happened.
  const result = await withTenant(tenantId, (c) => sourceRepo.deleteSource(c, req.params.id));
  ok(res, { id: req.params.id, ...result });
});

export const listCollections = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) =>
    repo.listCollections(c, {
      sourceId: req.query.sourceId as string,
      projectId: req.query.projectId as string,
      includeUnfiled: req.query.includeUnfiled !== 'false',
    })
  );
  ok(res, data);
});

export const createCollection = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = collectionCreateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.createCollection(c, userId, input));
  ok(res, data, 201);
});

export const updateCollection = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = collectionUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.updateCollection(c, userId, req.params.id, input));
  ok(res, data);
});

export const deleteCollection = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  await withTenant(tenantId, (c) => repo.deleteCollection(c, req.params.id));
  ok(res, { id: req.params.id });
});

export const listApis = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const { page, pageSize, offset } = paging(req.query as any);
  const { items, total } = await withTenant(tenantId, (c) =>
    repo.listApis(
      c,
      {
        search: req.query.search as string,
        collectionId: req.query.collectionId as string,
        sourceId: req.query.sourceId as string,
        method: req.query.method as string,
        projectId: req.query.projectId as string,
        allowedProjects: String(req.query.allowedProjects ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
        includeDeprecated: req.query.includeDeprecated === 'true',
      },
      { limit: pageSize, offset }
    )
  );
  okList(res, items, { total, page, pageSize });
});

export const getApi = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => repo.getApi(c, req.params.id));
  ok(res, data);
});

export const createApi = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = apiCreateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.createApi(c, userId, input));
  ok(res, data, 201);
});

export const updateApi = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = apiUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.updateApi(c, userId, req.params.id, input));
  ok(res, data);
});

export const deleteApi = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  await withTenant(tenantId, (c) => repo.deleteApi(c, req.params.id));
  ok(res, { id: req.params.id });
});

/**
 * Real responses this API has already produced inside a flow.
 *
 * The non-destructive alternative to Send: a POST captured from history
 * creates nothing, because the request already happened.
 */
export const capturedResponses = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => runRepo.capturedResponses(c, req.params.id));
  ok(res, data);
});

/**
 * Send the draft once and return the real response, so the author can capture
 * the expected status and sample payload rather than typing them.
 *
 * Nothing is persisted — this is a lookup, not QA evidence. A 4xx/5xx from the
 * target is a successful *call* and comes back as data; only a transport
 * failure or a refused URL is an error.
 */
export const tryApi = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const input = tryApiSchema.parse(req.body);

  const data = await withTenant(tenantId, async (c) => {
    const environment = input.environmentId
      ? await environmentRepo.getEnvironmentForRun(c, input.environmentId)
      : await environmentRepo.getDefaultEnvironment(c);

    const authApi = input.authApiId ? await repo.getApi(c, input.authApiId) : null;

    return tryRequest({
      draft: input.definition as any,
      environment,
      variables: input.variables,
      authApi,
      authConfig: input.authConfig,
    });
  });

  ok(res, data);
});

/** Fix spelling and grammar in a description, changing nothing else. */
export const fixGrammar = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const { text } = grammarSchema.parse(req.body);
  const corrected = await correctGrammar(tenantId, text);
  ok(res, { text: corrected, changed: corrected !== text.trim() });
});

export const stats = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => repo.apiStats(c));
  ok(res, data);
});
