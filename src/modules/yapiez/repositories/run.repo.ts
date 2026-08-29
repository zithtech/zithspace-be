// src/modules/yapiez/repositories/run.repo.ts
// Flow runs and their per-step records — the evidence QA Space reports on.

import { TenantClient } from '../db/pool';
import { YapiezError } from '../types';
import { RunDto, RunStepDto, toRun, toRunStep } from './mappers';

const RUN_SELECT = `
  SELECT r.*, f.name AS flow_name, env.name AS environment_name, sc.name AS scope_name
    FROM yapiez_flow_runs r
    LEFT JOIN yapiez_flows f ON f.id = r.flow_id
    LEFT JOIN yapiez_environments env ON env.id = r.environment_id
    LEFT JOIN qa_test_scopes sc ON sc.id = r.scope_id
`;

export interface RunListFilters {
  flowId?: string;
  scopeId?: string;
  status?: string;
  search?: string;
}

export async function listRuns(
  c: TenantClient,
  filters: RunListFilters,
  page: { limit: number; offset: number }
): Promise<{ items: RunDto[]; total: number }> {
  const params: any[] = [c.tenantId];
  const where: string[] = ['r.tenant_id = $1'];

  if (filters.flowId) {
    params.push(filters.flowId);
    where.push(`r.flow_id = $${params.length}`);
  }
  if (filters.scopeId) {
    params.push(filters.scopeId);
    where.push(`r.scope_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`r.status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(f.name ILIKE $${params.length} OR r.run_name ILIKE $${params.length})`);
  }

  const whereSql = where.join(' AND ');
  const { rows: countRows } = await c.query(
    `SELECT COUNT(*)::int AS total
       FROM yapiez_flow_runs r
       LEFT JOIN yapiez_flows f ON f.id = r.flow_id
      WHERE ${whereSql}`,
    params
  );

  params.push(page.limit, page.offset);
  const { rows } = await c.query(
    `${RUN_SELECT} WHERE ${whereSql}
      ORDER BY r.started_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { items: rows.map(toRun), total: countRows[0]?.total ?? 0 };
}

export async function getRun(c: TenantClient, id: string): Promise<RunDto> {
  const { rows } = await c.query(`${RUN_SELECT} WHERE r.id = $1 AND r.tenant_id = $2`, [
    id,
    c.tenantId,
  ]);
  if (!rows[0]) throw YapiezError.notFound('Run');
  const run = toRun(rows[0]);
  run.steps = await listRunSteps(c, id);
  return run;
}

export async function listRunSteps(c: TenantClient, runId: string): Promise<RunStepDto[]> {
  const { rows } = await c.query(
    `SELECT rs.*, b.bug_number
       FROM yapiez_flow_run_steps rs
       LEFT JOIN bugs b ON b.id = rs.bug_id
      WHERE rs.run_id = $1 AND rs.tenant_id = $2
      ORDER BY rs.position ASC, rs.created_at ASC`,
    [runId, c.tenantId]
  );
  return rows.map(toRunStep);
}

export async function getRunStep(c: TenantClient, stepId: string): Promise<RunStepDto> {
  const { rows } = await c.query(
    `SELECT rs.*, b.bug_number
       FROM yapiez_flow_run_steps rs
       LEFT JOIN bugs b ON b.id = rs.bug_id
      WHERE rs.id = $1 AND rs.tenant_id = $2`,
    [stepId, c.tenantId]
  );
  if (!rows[0]) throw YapiezError.notFound('Run step');
  return toRunStep(rows[0]);
}

/** Open a run row the moment execution starts, so a crash still leaves a trace. */
export async function startRun(
  c: TenantClient,
  input: {
    flowId: string;
    environmentId: string | null;
    scopeId: string | null;
    runName: string | null;
    totalSteps: number;
    triggerSource: string;
    triggeredBy: string;
  }
): Promise<RunDto> {
  const { rows: numberRows } = await c.query(
    `SELECT COALESCE(MAX(run_number), 0) + 1 AS next FROM yapiez_flow_runs WHERE flow_id = $1`,
    [input.flowId]
  );

  const { rows } = await c.query(
    `INSERT INTO yapiez_flow_runs
       (tenant_id, flow_id, environment_id, scope_id, run_number, run_name,
        status, trigger_source, total_steps, triggered_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'Running', $7, $8, $9)
     RETURNING *`,
    [
      c.tenantId,
      input.flowId,
      input.environmentId,
      input.scopeId,
      numberRows[0].next,
      input.runName,
      input.triggerSource,
      input.totalSteps,
      input.triggeredBy,
    ]
  );
  return toRun(rows[0]);
}

export async function recordRunStep(
  c: TenantClient,
  runId: string,
  step: Omit<RunStepDto, 'id' | 'runId' | 'bugId' | 'bugNumber'>
): Promise<RunStepDto> {
  const { rows } = await c.query(
    `INSERT INTO yapiez_flow_run_steps
       (tenant_id, run_id, step_id, api_id, position, step_name, step_kind, method,
        resolved_url, request_headers, request_body, status_code, response_headers,
        response_body, response_size, duration_ms, status, assertion_results, extracted, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb,
             $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20)
     RETURNING *`,
    [
      c.tenantId,
      runId,
      step.stepId,
      step.apiId,
      step.position,
      step.stepName,
      step.stepKind,
      step.method,
      step.resolvedUrl,
      JSON.stringify(step.requestHeaders ?? {}),
      step.requestBody,
      step.statusCode,
      JSON.stringify(step.responseHeaders ?? {}),
      step.responseBody,
      step.responseSize,
      step.durationMs,
      step.status,
      JSON.stringify(step.assertionResults ?? []),
      JSON.stringify(step.extracted ?? {}),
      step.error,
    ]
  );
  return toRunStep(rows[0]);
}

/**
 * Close the run and stamp the result onto its flow, so the flows list can show
 * "last run: Failed 3 minutes ago" without a second query per row.
 */
export async function finishRun(
  c: TenantClient,
  runId: string,
  input: {
    status: string;
    passedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    durationMs: number;
    variables: Record<string, unknown>;
    error: string | null;
  }
): Promise<RunDto> {
  const { rows } = await c.query(
    `UPDATE yapiez_flow_runs
        SET status = $3, passed_steps = $4, failed_steps = $5, skipped_steps = $6,
            duration_ms = $7, variables = $8::jsonb, error = $9, finished_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      runId,
      c.tenantId,
      input.status,
      input.passedSteps,
      input.failedSteps,
      input.skippedSteps,
      input.durationMs,
      JSON.stringify(input.variables ?? {}),
      input.error,
    ]
  );
  if (!rows[0]) throw YapiezError.notFound('Run');

  await c.query(
    `UPDATE yapiez_flows
        SET last_run_id = $1, last_run_status = $2, last_run_at = NOW()
      WHERE id = $3 AND tenant_id = $4`,
    [runId, input.status, rows[0].flow_id, c.tenantId]
  );

  return toRun(rows[0]);
}

/**
 * Real responses this API has already produced, newest first.
 *
 * The non-destructive way to fill in an expected result: if the endpoint has
 * ever run inside a flow, its genuine response is already recorded here. No
 * new request is made, so a POST captured this way creates nothing.
 *
 * Only successful-transport steps are offered — a step that never reached the
 * server has no body worth copying.
 */
export async function capturedResponses(
  c: TenantClient,
  apiId: string,
  limit = 10
): Promise<Array<{
  runStepId: string;
  statusCode: number | null;
  body: string | null;
  durationMs: number | null;
  status: string;
  stepName: string;
  flowName: string | null;
  runNumber: number | null;
  capturedAt: string;
}>> {
  const { rows } = await c.query(
    `SELECT rs.id, rs.status_code, rs.response_body, rs.duration_ms, rs.status,
            rs.step_name, rs.created_at,
            f.name AS flow_name, r.run_number
       FROM yapiez_flow_run_steps rs
       JOIN yapiez_flow_runs r ON r.id = rs.run_id
       LEFT JOIN yapiez_flows f ON f.id = r.flow_id
      WHERE rs.api_id = $1
        AND rs.tenant_id = $2
        AND rs.step_kind = 'api'
        AND rs.status_code IS NOT NULL
      ORDER BY rs.created_at DESC
      LIMIT $3`,
    [apiId, c.tenantId, limit]
  );

  return rows.map((row: any) => ({
    runStepId: row.id,
    statusCode: row.status_code ?? null,
    body: row.response_body ?? null,
    durationMs: row.duration_ms ?? null,
    status: row.status,
    stepName: row.step_name,
    flowName: row.flow_name ?? null,
    runNumber: row.run_number !== null && row.run_number !== undefined ? Number(row.run_number) : null,
    capturedAt: row.created_at,
  }));
}

/** Attach a BugList entry to the failed step it came from. */
export async function linkBug(c: TenantClient, runStepId: string, bugId: string): Promise<void> {
  const { rowCount } = await c.query(
    `UPDATE yapiez_flow_run_steps SET bug_id = $1 WHERE id = $2 AND tenant_id = $3`,
    [bugId, runStepId, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound('Run step');
}

export async function deleteRun(c: TenantClient, id: string): Promise<void> {
  const { rowCount } = await c.query(
    `DELETE FROM yapiez_flow_runs WHERE id = $1 AND tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound('Run');
}

/**
 * Per-scope roll-up for QA Space: the latest run of every flow attached to a
 * scope. This is what a QA Submission cites as its API-testing evidence.
 */
export async function scopeSummary(c: TenantClient, scopeId: string): Promise<any> {
  const { rows } = await c.query(
    `WITH latest AS (
       SELECT DISTINCT ON (r.flow_id) r.*
         FROM yapiez_flow_runs r
        WHERE r.tenant_id = $1 AND r.scope_id = $2
        ORDER BY r.flow_id, r.started_at DESC
     )
     SELECT l.*, f.name AS flow_name, env.name AS environment_name, sc.name AS scope_name
       FROM latest l
       LEFT JOIN yapiez_flows f ON f.id = l.flow_id
       LEFT JOIN yapiez_environments env ON env.id = l.environment_id
       LEFT JOIN qa_test_scopes sc ON sc.id = l.scope_id
      ORDER BY l.started_at DESC`,
    [c.tenantId, scopeId]
  );

  const runs = rows.map(toRun);
  return {
    scopeId,
    flows: runs.length,
    totalSteps: runs.reduce((sum, r) => sum + r.totalSteps, 0),
    passedSteps: runs.reduce((sum, r) => sum + r.passedSteps, 0),
    failedSteps: runs.reduce((sum, r) => sum + r.failedSteps, 0),
    skippedSteps: runs.reduce((sum, r) => sum + r.skippedSteps, 0),
    failingFlows: runs.filter((r) => r.status === 'Failed').length,
    runs,
  };
}
