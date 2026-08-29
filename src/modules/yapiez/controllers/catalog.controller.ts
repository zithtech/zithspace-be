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
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

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
  
  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.CREATE,
    entityType: EntityType.API_SOURCE,
    entityId: data.id,
    entityLabel: data.label,
  });

  ok(res, data, 201);
});

export const updateSource = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = sourceUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => sourceRepo.updateSource(c, userId, req.params.id, input));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.UPDATE,
    entityType: EntityType.API_SOURCE,
    entityId: data.id,
    entityLabel: data.label,
  });

  ok(res, data);
});

export const deleteSource = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  // Collections under it survive as unfiled; the count says how many so the UI
  // can report what actually happened.
  const result = await withTenant(tenantId, (c) => sourceRepo.deleteSource(c, req.params.id));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.DELETE,
    entityType: EntityType.API_SOURCE,
    entityId: req.params.id,
  });

  ok(res, { id: req.params.id, ...result });
});

export const listCollections = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) =>
    repo.listCollections(c, {
      sourceId: req.query.sourceId as string,
      projectId: req.query.projectId as string,
      moduleName: req.query.moduleName as string,
      includeUnfiled: req.query.includeUnfiled !== 'false',
    })
  );
  ok(res, data);
});

export const createCollection = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = collectionCreateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.createCollection(c, userId, input));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.CREATE,
    entityType: EntityType.API_COLLECTION,
    entityId: data.id,
    entityLabel: data.name,
  });

  ok(res, data, 201);
});

export const updateCollection = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = collectionUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.updateCollection(c, userId, req.params.id, input));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.UPDATE,
    entityType: EntityType.API_COLLECTION,
    entityId: data.id,
    entityLabel: data.name,
  });

  ok(res, data);
});

export const deleteCollection = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  await withTenant(tenantId, (c) => repo.deleteCollection(c, userId, req.params.id));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.DELETE,
    entityType: EntityType.API_COLLECTION,
    entityId: req.params.id,
  });

  ok(res, { id: req.params.id });
});

/** Unfile everything under a module, keeping every collection and endpoint. */
export const unfileModule = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const name = String(req.query.name ?? '').trim();
  if (!name) {
    return ok(res, { apis: 0, collections: 0 });
  }
  const data = await withTenant(tenantId, (c) =>
    repo.unfileModule(c, { projectId: (req.query.projectId as string) || undefined, name })
  );
  ok(res, data);
});

// ─── Trash ──────────────────────────────────────────────────────────────────

/** What has been thrown away and can still be brought back. */
export const listTrash = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) =>
    repo.listTrash(c, { projectId: (req.query.projectId as string) || undefined })
  );
  ok(res, data);
});

/** The kind is part of the request because the two live in different tables. */
function trashKindOf(value: unknown): 'api' | 'collection' {
  return value === 'collection' ? 'collection' : 'api';
}

export const restoreFromTrash = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const kind = trashKindOf(req.body?.kind);
  const id = String(req.body?.id ?? '');
  await withTenant(tenantId, (c) => repo.restoreFromTrash(c, kind, id));
  ok(res, { kind, id });
});

export const purgeFromTrash = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const kind = trashKindOf(req.query.kind);
  const id = String(req.query.id ?? '');
  await withTenant(tenantId, (c) => repo.purgeFromTrash(c, kind, id));
  ok(res, { kind, id });
});

export const emptyTrash = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) =>
    repo.emptyTrash(c, { projectId: (req.query.projectId as string) || undefined })
  );
  ok(res, data);
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
        moduleName: req.query.moduleName as string,
        unfiledOnly: req.query.unfiledOnly === 'true',
        method: req.query.method as string,
        authType: req.query.authType as string,
        deprecatedOnly: req.query.deprecatedOnly === 'true',
        sort: req.query.sort as string,
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

/**
 * What each module holds, for the catalog's module cards.
 *
 * Only the definitions' side of it — the curated module list itself belongs to
 * QA Settings, and the client merges the two so a module with no endpoints yet
 * still appears.
 */
export const moduleSummaries = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) =>
    repo.listModuleSummaries(c, {
      projectId: req.query.projectId as string,
      sourceId: req.query.sourceId as string,
      allowedProjects: String(req.query.allowedProjects ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
      includeDeprecated: req.query.includeDeprecated === 'true',
    })
  );
  ok(res, data);
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

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.CREATE,
    entityType: EntityType.API_ENDPOINT,
    entityId: data.id,
    entityLabel: data.name,
  });

  ok(res, data, 201);
});

export const updateApi = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = apiUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.updateApi(c, userId, req.params.id, input));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.UPDATE,
    entityType: EntityType.API_ENDPOINT,
    entityId: data.id,
    entityLabel: data.name,
  });

  ok(res, data);
});

export const deleteApi = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  await withTenant(tenantId, (c) => repo.deleteApi(c, userId, req.params.id));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_DASHBOARD,
    action: Action.DELETE,
    entityType: EntityType.API_ENDPOINT,
    entityId: req.params.id,
  });

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
      baseUrlOverride: input.baseUrl ?? null,
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
