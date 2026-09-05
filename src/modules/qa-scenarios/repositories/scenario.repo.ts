// src/modules/qa-scenarios/repositories/scenario.repo.ts
//
// Every query here takes a tenant-scoped client from `withTenant` AND filters
// on tenant_id explicitly. The join tables it reads across (qa_test_cases,
// qa_parent_test_cases) are owned by the QA test-case controllers; this module
// only reads them to prove a case may be mapped into a flow.

import { TenantClient } from '../db/pool';

export interface ScenarioStep {
  id: string;
  test_case_id: string;
  position: number;
  case_code: string | null;
  name: string;
  status: string | null;
  priority: string | null;
  test_type: string | null;
  automation: string | null;
}

export interface Scenario {
  id: string;
  tenant_id: string;
  parent_test_case_id: string;
  module_id: string | null;
  name: string;
  description: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string | null;
  case_count: number;
  steps: ScenarioStep[];
}

/**
 * The flows on one Module Test Cases page, each carrying its ordered steps.
 *
 * The steps are aggregated in the same round trip rather than fetched per
 * scenario: a page with fifteen flows would otherwise cost sixteen queries to
 * paint, and the flow view shows every step by default.
 */
export async function listScenarios(
  client: TenantClient,
  parentTestCaseId: string
): Promise<Scenario[]> {
  const { rows } = await client.query<Scenario>(
    `
    SELECT s.*,
           u.name AS creator_name,
           COALESCE(st.case_count, 0)::int AS case_count,
           COALESCE(st.steps, '[]'::json) AS steps
      FROM qa_test_scenarios s
      LEFT JOIN users u ON s.created_by::text = u.id::text
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS case_count,
               json_agg(
                 json_build_object(
                   'id', sc.id,
                   'test_case_id', tc.id,
                   'position', sc.position,
                   'case_code', tc.test_case_id,
                   'name', tc.name,
                   'status', tc.status,
                   'priority', tc.priority,
                   'test_type', tc.test_type,
                   'automation', tc.automation
                 ) ORDER BY sc.position, sc.created_at
               ) AS steps
          FROM qa_test_scenario_cases sc
          JOIN qa_test_cases tc ON tc.id = sc.test_case_id
         WHERE sc.scenario_id = s.id
      ) st ON TRUE
     WHERE s.tenant_id = $1
       AND s.parent_test_case_id = $2
     ORDER BY s.position, s.created_at
    `,
    [client.tenantId, parentTestCaseId]
  );
  return rows;
}

/** One flow with its steps — used after every write so the client repaints from truth. */
export async function getScenario(client: TenantClient, id: string): Promise<Scenario | null> {
  const { rows } = await client.query<Scenario>(
    `
    SELECT s.*,
           u.name AS creator_name,
           COALESCE(st.case_count, 0)::int AS case_count,
           COALESCE(st.steps, '[]'::json) AS steps
      FROM qa_test_scenarios s
      LEFT JOIN users u ON s.created_by::text = u.id::text
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS case_count,
               json_agg(
                 json_build_object(
                   'id', sc.id,
                   'test_case_id', tc.id,
                   'position', sc.position,
                   'case_code', tc.test_case_id,
                   'name', tc.name,
                   'status', tc.status,
                   'priority', tc.priority,
                   'test_type', tc.test_type,
                   'automation', tc.automation
                 ) ORDER BY sc.position, sc.created_at
               ) AS steps
          FROM qa_test_scenario_cases sc
          JOIN qa_test_cases tc ON tc.id = sc.test_case_id
         WHERE sc.scenario_id = s.id
      ) st ON TRUE
     WHERE s.tenant_id = $1 AND s.id = $2
    `,
    [client.tenantId, id]
  );
  return rows[0] ?? null;
}

/**
 * Which flows each case on this page belongs to.
 *
 * Feeds the "Scenario" column of the flat list, so a tester scrolling a
 * hundred cases can see at a glance which are already mapped and which are
 * still loose. Returned flat; the client groups by test_case_id.
 */
export async function listMemberships(
  client: TenantClient,
  parentTestCaseId: string
): Promise<Array<{ test_case_id: string; scenario_id: string; name: string; position: number }>> {
  const { rows } = await client.query(
    `
    SELECT sc.test_case_id, sc.scenario_id, s.name, sc.position
      FROM qa_test_scenario_cases sc
      JOIN qa_test_scenarios s ON s.id = sc.scenario_id
     WHERE sc.tenant_id = $1
       AND s.parent_test_case_id = $2
     ORDER BY s.position, sc.position
    `,
    [client.tenantId, parentTestCaseId]
  );
  return rows as any;
}

/**
 * Every flow that touches one of these cases, with its full ordered steps.
 *
 * This is the run's question, not the page's: a run executes a suite, whose
 * cases can come from several module scenarios at once, so there is no single
 * parent id to look up. The steps come back whole — a flow half-shown would
 * misreport what the tester still has to walk.
 */
export async function listScenariosForCases(
  client: TenantClient,
  caseIds: string[]
): Promise<Scenario[]> {
  if (caseIds.length === 0) return [];
  const { rows } = await client.query<Scenario>(
    `
    SELECT s.*,
           u.name AS creator_name,
           COALESCE(st.case_count, 0)::int AS case_count,
           COALESCE(st.steps, '[]'::json) AS steps
      FROM qa_test_scenarios s
      LEFT JOIN users u ON s.created_by::text = u.id::text
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS case_count,
               json_agg(
                 json_build_object(
                   'id', sc.id,
                   'test_case_id', tc.id,
                   'position', sc.position,
                   'case_code', tc.test_case_id,
                   'name', tc.name,
                   'status', tc.status,
                   'priority', tc.priority,
                   'test_type', tc.test_type,
                   'automation', tc.automation
                 ) ORDER BY sc.position, sc.created_at
               ) AS steps
          FROM qa_test_scenario_cases sc
          JOIN qa_test_cases tc ON tc.id = sc.test_case_id
         WHERE sc.scenario_id = s.id
      ) st ON TRUE
     WHERE s.tenant_id = $1
       AND EXISTS (
         SELECT 1 FROM qa_test_scenario_cases m
          WHERE m.scenario_id = s.id AND m.test_case_id = ANY($2::uuid[])
       )
     ORDER BY s.position, s.created_at
    `,
    [client.tenantId, caseIds]
  );
  return rows;
}

/** Which of these cases sit in which flow, and at what step. */
export async function listMembershipsForCases(
  client: TenantClient,
  caseIds: string[]
): Promise<Array<{ test_case_id: string; scenario_id: string; name: string; position: number }>> {
  if (caseIds.length === 0) return [];
  const { rows } = await client.query(
    `
    SELECT sc.test_case_id, sc.scenario_id, s.name, sc.position
      FROM qa_test_scenario_cases sc
      JOIN qa_test_scenarios s ON s.id = sc.scenario_id
     WHERE sc.tenant_id = $1
       AND sc.test_case_id = ANY($2::uuid[])
     ORDER BY s.position, sc.position
    `,
    [client.tenantId, caseIds]
  );
  return rows as any;
}

/** The parent page a flow hangs off, proving it is this tenant's. */
export async function findParent(
  client: TenantClient,
  parentTestCaseId: string
): Promise<{ id: string; module_id: string | null } | null> {
  const { rows } = await client.query(
    `SELECT id, module_id FROM qa_parent_test_cases WHERE id = $1 AND tenant_id = $2`,
    [parentTestCaseId, client.tenantId]
  );
  return rows[0] ?? null;
}

/**
 * Of the ids given, the ones that really are cases on this page.
 *
 * A flow may only walk cases from the module scenario it is drawn on: mapping
 * a case from another page would put a step in a flow that the page it belongs
 * to cannot see or reorder.
 */
export async function filterCasesOnPage(
  client: TenantClient,
  parentTestCaseId: string,
  caseIds: string[]
): Promise<Set<string>> {
  if (caseIds.length === 0) return new Set();
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM qa_test_cases
      WHERE tenant_id = $1 AND parent_test_case_id = $2 AND id = ANY($3::uuid[])`,
    [client.tenantId, parentTestCaseId, caseIds]
  );
  return new Set(rows.map((r) => r.id));
}

export async function createScenario(
  client: TenantClient,
  input: {
    parentTestCaseId: string;
    moduleId: string | null;
    name: string;
    description: string | null;
    createdBy: string | null;
  }
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `
    INSERT INTO qa_test_scenarios
      (tenant_id, parent_test_case_id, module_id, name, description, position, created_by, updated_by)
    VALUES
      ($1, $2, $3, $4, $5,
       COALESCE((SELECT MAX(position) + 1 FROM qa_test_scenarios
                  WHERE tenant_id = $1 AND parent_test_case_id = $2), 0),
       $6, $6)
    RETURNING id
    `,
    [
      client.tenantId,
      input.parentTestCaseId,
      input.moduleId,
      input.name,
      input.description,
      input.createdBy,
    ]
  );
  return rows[0].id;
}

export async function updateScenario(
  client: TenantClient,
  id: string,
  patch: { name?: string; description?: string | null },
  updatedBy: string | null
): Promise<boolean> {
  // Built by hand rather than COALESCE-ing every column: clearing a
  // description is a real edit, and `COALESCE($n, description)` cannot tell
  // "set it to nothing" apart from "leave it alone".
  const sets: string[] = ['updated_by = $3', 'updated_at = NOW()'];
  const params: any[] = [client.tenantId, id, updatedBy];

  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.description !== undefined) {
    params.push(patch.description);
    sets.push(`description = $${params.length}`);
  }

  const { rowCount } = await client.query(
    `UPDATE qa_test_scenarios SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2`,
    params
  );
  return (rowCount ?? 0) > 0;
}

/** Drops the flow. The cases themselves are untouched — only the grouping goes. */
export async function deleteScenario(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM qa_test_scenarios WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Replace the flow's membership with exactly `caseIds`, in that order.
 *
 * Delete-then-insert rather than a diff: the client always sends the whole
 * ordered list, positions are rewritten wholesale anyway, and the pair runs
 * inside the caller's transaction, so no reader ever sees the empty middle.
 */
export async function setScenarioCases(
  client: TenantClient,
  scenarioId: string,
  caseIds: string[]
): Promise<void> {
  await client.query(
    `DELETE FROM qa_test_scenario_cases WHERE tenant_id = $1 AND scenario_id = $2`,
    [client.tenantId, scenarioId]
  );
  if (caseIds.length === 0) return;
  await client.query(
    `
    INSERT INTO qa_test_scenario_cases (tenant_id, scenario_id, test_case_id, position)
    SELECT $1, $2, id, ordinality - 1
      FROM UNNEST($3::uuid[]) WITH ORDINALITY AS t(id, ordinality)
    `,
    [client.tenantId, scenarioId, caseIds]
  );
  await touch(client, scenarioId);
}

/** Append cases to the end of the flow, ignoring any already in it. */
export async function addScenarioCases(
  client: TenantClient,
  scenarioId: string,
  caseIds: string[]
): Promise<void> {
  if (caseIds.length === 0) return;
  await client.query(
    `
    INSERT INTO qa_test_scenario_cases (tenant_id, scenario_id, test_case_id, position)
    SELECT $1, $2, t.id,
           COALESCE((SELECT MAX(position) + 1 FROM qa_test_scenario_cases
                      WHERE scenario_id = $2), 0) + t.ordinality - 1
      FROM UNNEST($3::uuid[]) WITH ORDINALITY AS t(id, ordinality)
    ON CONFLICT (scenario_id, test_case_id) DO NOTHING
    `,
    [client.tenantId, scenarioId, caseIds]
  );
  await resequence(client, scenarioId);
  await touch(client, scenarioId);
}

/** Take one case out of the flow, closing the gap it leaves behind. */
export async function removeScenarioCase(
  client: TenantClient,
  scenarioId: string,
  testCaseId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM qa_test_scenario_cases
      WHERE tenant_id = $1 AND scenario_id = $2 AND test_case_id = $3`,
    [client.tenantId, scenarioId, testCaseId]
  );
  if ((rowCount ?? 0) === 0) return false;
  await resequence(client, scenarioId);
  await touch(client, scenarioId);
  return true;
}

/** Reorder the flows themselves. Ids not on this page are ignored. */
export async function reorderScenarios(
  client: TenantClient,
  parentTestCaseId: string,
  scenarioIds: string[]
): Promise<void> {
  await client.query(
    `
    UPDATE qa_test_scenarios s
       SET position = t.ordinality - 1, updated_at = NOW()
      FROM UNNEST($3::uuid[]) WITH ORDINALITY AS t(id, ordinality)
     WHERE s.id = t.id
       AND s.tenant_id = $1
       AND s.parent_test_case_id = $2
    `,
    [client.tenantId, parentTestCaseId, scenarioIds]
  );
}

/** Close gaps left by a delete so step numbers stay 1..n with no holes. */
async function resequence(client: TenantClient, scenarioId: string): Promise<void> {
  await client.query(
    `
    UPDATE qa_test_scenario_cases sc
       SET position = ranked.rn - 1
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) AS rn
          FROM qa_test_scenario_cases
         WHERE scenario_id = $1
      ) ranked
     WHERE sc.id = ranked.id AND sc.position <> ranked.rn - 1
    `,
    [scenarioId]
  );
}

/** Membership changes are changes to the flow — keep updated_at honest. */
async function touch(client: TenantClient, scenarioId: string): Promise<void> {
  await client.query(
    `UPDATE qa_test_scenarios SET updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, scenarioId]
  );
}
