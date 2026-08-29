// src/modules/yapiez/controllers/run.controller.ts
// Executing flows, reading the results, and turning a failure into a bug.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import * as runRepo from '../repositories/run.repo';
import { actorOf, handle, ok, okList, paging } from '../http';
import { raiseBugSchema, runFlowSchema } from '../validators';
import { runFlow } from '../services/flowRunner';
import { bugTargets, describeFailure, raiseBugForStep } from '../services/bugBridge';
import { YapiezError } from '../types';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

/**
 * Run a flow and return the finished run.
 *
 * Deliberately synchronous: QA clicks Run and waits for the step list to fill
 * in. Per-request timeouts in transport.ts bound how long that can take. If
 * flows ever grow past what one request should hold open, this is the seam to
 * move onto the existing BullMQ queue — the runner already persists
 * incrementally, so a polling client would need no engine changes.
 */
export const execute = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = runFlowSchema.parse(req.body ?? {});

  const run = await runFlow(tenantId, userId, req.params.id, {
    environmentId: input.environmentId ?? undefined,
    variables: input.variables,
    runName: input.runName ?? undefined,
    onlyStepIds: input.onlyStepIds,
    triggerSource: 'manual',
  });

  const full = await withTenant(tenantId, (c) => runRepo.getRun(c, run.id));

  recordTransaction({
    req,
    section: Section.WORK,
    module: Module.API_HUB,
    page: Page.API_HUB_FLOW_EDITOR,
    action: Action.RUN,
    entityType: EntityType.API_FLOW,
    entityId: req.params.id,
  });

  ok(res, full, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const { page, pageSize, offset } = paging(req.query as any);
  const { items, total } = await withTenant(tenantId, (c) =>
    runRepo.listRuns(
      c,
      {
        flowId: req.query.flowId as string,
        scopeId: req.query.scopeId as string,
        status: req.query.status as string,
        search: req.query.search as string,
      },
      { limit: pageSize, offset }
    )
  );
  okList(res, items, { total, page, pageSize });
});

export const get = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => runRepo.getRun(c, req.params.id));
  ok(res, data);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  await withTenant(tenantId, (c) => runRepo.deleteRun(c, req.params.id));
  ok(res, { id: req.params.id });
});

/**
 * The QA Space read: every flow attached to a Test Scope, with its latest
 * result. This is what a QA Submission cites as API-testing evidence, and what
 * the Test Scope page shows alongside its manual test runs.
 */
export const scopeSummary = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => runRepo.scopeSummary(c, req.params.scopeId));
  ok(res, data);
});

/** Folders and sheets a bug can be filed into, for the raise-bug picker. */
export const listBugTargets = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, (c) => bugTargets(c, req.query.projectId as string));
  ok(res, data);
});

/**
 * The prefilled bug a failed step would produce — fetched before the modal
 * opens so QA edits real text rather than composing from scratch.
 */
export const bugDraft = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const data = await withTenant(tenantId, async (c) => {
    const step = await runRepo.getRunStep(c, req.params.stepId);
    const run = await runRepo.getRun(c, step.runId);
    return {
      title: `${step.method ?? 'API'} ${step.stepName} failed in ${run.flowName ?? 'flow'}`,
      description: describeFailure(run, step),
      module: run.flowName,
      bugType: 'api',
      severity: 'major',
      alreadyLinked: step.bugId ? { id: step.bugId, bugNumber: step.bugNumber } : null,
    };
  });
  ok(res, data);
});

export const raiseBug = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const input = raiseBugSchema.parse(req.body);

  const data = await withTenant(tenantId, async (c) => {
    const step = await runRepo.getRunStep(c, req.params.stepId);
    if (step.status !== 'Fail') {
      throw YapiezError.badRequest('Only a failed step can be raised as a bug.');
    }
    const run = await runRepo.getRun(c, step.runId);
    return raiseBugForStep(c, userId, run, step, input);
  });

  ok(res, data, 201);
});

/** Link a step to a bug that already exists in the Bug List. */
export const linkExistingBug = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const bugId = String(req.body?.bugId ?? '').trim();
  if (!bugId) throw YapiezError.badRequest('Choose a bug to link.');

  await withTenant(tenantId, async (c) => {
    const { rows } = await c.query(`SELECT id FROM bugs WHERE id = $1 AND tenant_id = $2`, [
      bugId,
      c.tenantId,
    ]);
    if (!rows[0]) throw YapiezError.notFound('Bug');
    await runRepo.linkBug(c, req.params.stepId, bugId);
  });

  ok(res, { stepId: req.params.stepId, bugId });
});
