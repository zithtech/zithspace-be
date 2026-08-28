// src/modules/yapiez/controllers/payload.controller.ts
//
// The Advanced section of the New Module Test Case drawer: pick an API from the
// case's module, pick what kind of payload you want, read what the server
// drafts, then confirm it onto the case.
//
// Generating and storing are deliberately two calls. A draft is disposable —
// the tester regenerates until the body looks right, and nothing is written
// until they say so. That is what "once confirm the payload type then store"
// means, and it keeps the table free of bodies nobody chose.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import * as repo from '../repositories/payload.repo';
import * as catalogRepo from '../repositories/catalog.repo';
import { buildPayload, PayloadType } from '../services/payloadBuilder';
import { actorOf, handle, isUuid, ok } from '../http';
import { YapiezError } from '../types';
import {
  payloadCreateSchema,
  payloadGenerateSchema,
  payloadLinkSchema,
  payloadUpdateSchema,
} from '../validators';

/**
 * Draft a payload. Writes nothing.
 *
 * Answers even when the tenant has no AI configured — the builder falls back to
 * the definition's own structure and reports which generator ran, so the drawer
 * can say "drafted from the API structure" rather than showing an error the
 * tester cannot act on.
 */
export const generatePayload = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const input = payloadGenerateSchema.parse(req.body);

  const api = await withTenant(tenantId, (c) => catalogRepo.getApi(c, input.apiId));
  const built = await buildPayload(tenantId, api, input.payloadType as PayloadType, input.hint);

  ok(res, {
    ...built,
    apiId: api.id,
    apiName: api.name,
    apiMethod: api.method,
    apiUrl: api.url,
    payloadType: input.payloadType,
    // What the drawer pre-fills the name with — "Create Order · Invalid" reads
    // in a list, "payload 3" does not.
    suggestedName: `${api.name} · ${input.payloadType}`,
  });
});

/**
 * Reject a malformed uuid before it reaches Postgres.
 *
 * `router.param` guards path params only; these arrive in the query string, and
 * an id typed by hand would otherwise surface as "invalid input syntax for type
 * uuid" — a 500 for what is plainly a bad request.
 */
function uuidFilter(value: unknown, name: string): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  if (!isUuid(raw)) throw YapiezError.badRequest(`Invalid ${name}: expected a uuid`);
  return raw;
}

export const listPayloads = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const q = req.query as Record<string, any>;
  const data = await withTenant(tenantId, (c) =>
    repo.listPayloads(c, {
      testCaseId: uuidFilter(q.testCaseId, 'testCaseId'),
      parentTestCaseId: uuidFilter(q.parentTestCaseId, 'parentTestCaseId'),
      apiId: uuidFilter(q.apiId, 'apiId'),
      moduleName: q.moduleName as string,
      projectId: q.projectId as string,
      payloadType: q.payloadType as string,
      unlinkedOnly: q.unlinkedOnly === 'true',
    })
  );
  ok(res, data);
});

/** Payloads for many cases at once, keyed by case id — for the case list. */
export const payloadsForCases = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const ids = String(req.query.caseIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // One bad id in the list would fail the whole ANY($1::uuid[]) cast.
  const bad = ids.find((id) => !isUuid(id));
  if (bad) throw YapiezError.badRequest(`Invalid caseIds entry: expected a uuid, got "${bad}"`);
  const data = await withTenant(tenantId, (c) => repo.listPayloadsForCases(c, ids));
  ok(res, data);
});

export const createPayload = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = payloadCreateSchema.parse(req.body);

  const data = await withTenant(tenantId, async (c) => {
    // Read the definition inside the same transaction the insert runs in: the
    // snapshot columns must describe the API as it is at the moment of saving,
    // and this also rejects an apiId from another tenant before it is stored.
    const api = await catalogRepo.getApi(c, input.apiId);
    return repo.createPayload(c, userId, input, {
      name: api.name,
      method: api.method,
      url: api.url,
      projectId: api.projectId,
      moduleName: api.moduleName,
    });
  });

  ok(res, data, 201);
});

export const updatePayload = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = payloadUpdateSchema.parse(req.body);
  const data = await withTenant(tenantId, (c) => repo.updatePayload(c, userId, req.params.id, input));
  ok(res, data);
});

/**
 * Adopt the drafts a create-drawer session confirmed before its case existed.
 *
 * Called once, right after the test case is written. Payloads already attached
 * to a case are left alone, so a replayed request cannot move one.
 */
export const linkPayloads = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = payloadLinkSchema.parse(req.body);
  const linked = await withTenant(tenantId, (c) =>
    repo.linkPayloads(c, userId, input.testCaseId, input.payloadIds)
  );
  ok(res, { linked });
});

export const deletePayload = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  await withTenant(tenantId, (c) => repo.deletePayload(c, req.params.id));
  ok(res, { deleted: true });
});
