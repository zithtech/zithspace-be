// src/modules/qa-scenarios/controllers/scenario.controller.ts
//
// Test Scenarios are the flow layer of the Module Test Cases page: a named
// group ("Create User") holding the cases that flow, in the order a tester
// walks them.
//
// ONE RULE RUNS THROUGH EVERY WRITE: a flow may only hold cases from the module
// scenario it is drawn on. The request says which cases; the database says
// which of those are really on this page, and anything else is dropped rather
// than trusted.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { actorOf, handle, ok, ScenarioError } from '../http';
import * as repo from '../repositories/scenario.repo';
import {
  addScenarioCasesSchema,
  createScenarioSchema,
  reorderScenariosSchema,
  setScenarioCasesSchema,
  updateScenarioSchema,
} from '../validators';

/** The parent page id, required by every read and by creation. */
const parentIdOf = (req: AuthRequest): string => {
  const raw = req.query.parent_id ?? req.query.parent_test_case_id;
  const parentId = typeof raw === 'string' ? raw.trim() : '';
  if (!parentId) throw new ScenarioError('parent_id is required', 400, 'MISSING_PARENT');
  return parentId;
};

/**
 * GET /api/v2/qa/scenarios?parent_id=…
 *
 * Returns the flows with their ordered steps, plus `unmapped` — the count of
 * cases on the page that no flow claims yet, which is the number the page
 * leads with when a tester first opens the grouped view.
 */
export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const parentId = parentIdOf(req);

  const data = await withTenant(tenantId, async (client) => {
    const scenarios = await repo.listScenarios(client, parentId);
    const memberships = await repo.listMemberships(client, parentId);
    return { scenarios, memberships };
  });

  ok(res, data);
});

/**
 * GET /api/v2/qa/scenarios/for-cases?case_ids=a,b,c
 *
 * The run screen's lookup: given the cases a run is executing, which flows do
 * they belong to? A run's suite can draw from several module scenarios, so it
 * has no single parent id to ask by.
 */
export const forCases = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const raw = typeof req.query.case_ids === 'string' ? req.query.case_ids : '';
  const caseIds = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (caseIds.length === 0) {
    return ok(res, { scenarios: [], memberships: [] });
  }
  if (caseIds.length > 1000) {
    throw new ScenarioError('Too many cases in one lookup', 400, 'TOO_MANY_CASES');
  }
  // Anything that is not a uuid would blow up the ::uuid[] cast; a bad id in
  // the querystring is a client bug, not a 500.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clean = caseIds.filter((id) => UUID.test(id));
  if (clean.length === 0) {
    return ok(res, { scenarios: [], memberships: [] });
  }

  const data = await withTenant(tenantId, async (client) => ({
    scenarios: await repo.listScenariosForCases(client, clean),
    memberships: await repo.listMembershipsForCases(client, clean),
  }));

  ok(res, data);
});

/** GET /api/v2/qa/scenarios/:id */
export const get = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const scenario = await withTenant(tenantId, (client) =>
    repo.getScenario(client, req.params.id)
  );
  if (!scenario) throw new ScenarioError('Test scenario not found', 404, 'NOT_FOUND');
  ok(res, scenario);
});

/** POST /api/v2/qa/scenarios — name the flow, optionally mapping cases at once. */
export const create = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = createScenarioSchema.parse(req.body);

  const scenario = await withTenant(tenantId, async (client) => {
    const parent = await repo.findParent(client, body.parent_test_case_id);
    if (!parent) throw new ScenarioError('Module scenario not found', 404, 'PARENT_NOT_FOUND');

    const id = await repo.createScenario(client, {
      parentTestCaseId: body.parent_test_case_id,
      moduleId: parent.module_id,
      name: body.name,
      description: body.description ?? null,
      createdBy: userId ?? null,
    });

    if (body.case_ids?.length) {
      const allowed = await repo.filterCasesOnPage(
        client,
        body.parent_test_case_id,
        body.case_ids
      );
      await repo.setScenarioCases(
        client,
        id,
        body.case_ids.filter((cid) => allowed.has(cid))
      );
    }

    return repo.getScenario(client, id);
  });

  ok(res, scenario, 201);
});

/** PUT /api/v2/qa/scenarios/:id — rename or re-describe the flow. */
export const update = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = updateScenarioSchema.parse(req.body);

  const scenario = await withTenant(tenantId, async (client) => {
    const existing = await repo.getScenario(client, req.params.id);
    if (!existing) throw new ScenarioError('Test scenario not found', 404, 'NOT_FOUND');
    await repo.updateScenario(client, req.params.id, body, userId ?? null);
    return repo.getScenario(client, req.params.id);
  });

  ok(res, scenario);
});

/**
 * DELETE /api/v2/qa/scenarios/:id
 *
 * Ungroups: the flow and its step order go, every case it held stays exactly
 * where it was in the module's list.
 */
export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const deleted = await withTenant(tenantId, (client) =>
    repo.deleteScenario(client, req.params.id)
  );
  if (!deleted) throw new ScenarioError('Test scenario not found', 404, 'NOT_FOUND');
  ok(res, { id: req.params.id });
});

/**
 * PUT /api/v2/qa/scenarios/:id/cases — the mapping screen's save.
 *
 * The body is the complete flow in order, so this is also how a reorder is
 * written: the client sends the list as it now reads on screen.
 */
export const setCases = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const body = setScenarioCasesSchema.parse(req.body);

  const scenario = await withTenant(tenantId, async (client) => {
    const existing = await repo.getScenario(client, req.params.id);
    if (!existing) throw new ScenarioError('Test scenario not found', 404, 'NOT_FOUND');

    const allowed = await repo.filterCasesOnPage(
      client,
      existing.parent_test_case_id,
      body.case_ids
    );
    const kept = body.case_ids.filter((id) => allowed.has(id));
    if (kept.length !== body.case_ids.length) {
      throw new ScenarioError(
        'Some of those cases do not belong to this module scenario',
        400,
        'CASE_NOT_ON_PAGE'
      );
    }

    await repo.setScenarioCases(client, req.params.id, kept);
    return repo.getScenario(client, req.params.id);
  });

  ok(res, scenario);
});

/** POST /api/v2/qa/scenarios/:id/cases — append cases to the end of the flow. */
export const addCases = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const body = addScenarioCasesSchema.parse(req.body);

  const scenario = await withTenant(tenantId, async (client) => {
    const existing = await repo.getScenario(client, req.params.id);
    if (!existing) throw new ScenarioError('Test scenario not found', 404, 'NOT_FOUND');

    const allowed = await repo.filterCasesOnPage(
      client,
      existing.parent_test_case_id,
      body.case_ids
    );
    const kept = body.case_ids.filter((id) => allowed.has(id));
    if (kept.length === 0) {
      throw new ScenarioError(
        'None of those cases belong to this module scenario',
        400,
        'CASE_NOT_ON_PAGE'
      );
    }

    await repo.addScenarioCases(client, req.params.id, kept);
    return repo.getScenario(client, req.params.id);
  });

  ok(res, scenario);
});

/** DELETE /api/v2/qa/scenarios/:id/cases/:caseId — drop one step from the flow. */
export const removeCase = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);

  const scenario = await withTenant(tenantId, async (client) => {
    const removed = await repo.removeScenarioCase(client, req.params.id, req.params.caseId);
    if (!removed) throw new ScenarioError('That case is not in this flow', 404, 'NOT_FOUND');
    return repo.getScenario(client, req.params.id);
  });

  ok(res, scenario);
});

/** PUT /api/v2/qa/scenarios/reorder — the order of the flows on the page. */
export const reorder = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const body = reorderScenariosSchema.parse(req.body);

  const scenarios = await withTenant(tenantId, async (client) => {
    await repo.reorderScenarios(client, body.parent_test_case_id, body.scenario_ids);
    return repo.listScenarios(client, body.parent_test_case_id);
  });

  ok(res, scenarios);
});
