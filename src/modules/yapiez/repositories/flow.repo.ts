// src/modules/yapiez/repositories/flow.repo.ts
// Flows and their ordered steps — QA's half of Yapiez.

import { TenantClient } from '../db/pool';
import { YapiezError } from '../types';
import { FlowDto, FlowStepDto, toFlow, toFlowStep } from './mappers';

const FLOW_SELECT = `
  SELECT f.*,
         env.name AS environment_name,
         auth.name AS auth_api_name,
         sc.name AS scope_name,
         (SELECT COUNT(*) FROM yapiez_flow_steps s WHERE s.flow_id = f.id) AS step_count
    FROM yapiez_flows f
    LEFT JOIN yapiez_environments env ON env.id = f.environment_id
    LEFT JOIN yapiez_apis auth ON auth.id = f.auth_api_id
    LEFT JOIN qa_test_scopes sc ON sc.id = f.scope_id
`;

export interface FlowListFilters {
  search?: string;
  scopeId?: string;
  projectId?: string;
  status?: string;
  environmentId?: string;
}

export async function listFlows(
  c: TenantClient,
  filters: FlowListFilters,
  page: { limit: number; offset: number }
): Promise<{ items: FlowDto[]; total: number }> {
  const params: any[] = [c.tenantId];
  const where: string[] = ['f.tenant_id = $1'];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(f.name ILIKE $${params.length} OR f.description ILIKE $${params.length})`);
  }
  if (filters.scopeId) {
    params.push(filters.scopeId);
    where.push(`f.scope_id = $${params.length}`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`f.project_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`f.status = $${params.length}`);
  }
  if (filters.environmentId) {
    params.push(filters.environmentId);
    where.push(`f.environment_id = $${params.length}`);
  }

  const whereSql = where.join(' AND ');
  const { rows: countRows } = await c.query(
    `SELECT COUNT(*)::int AS total FROM yapiez_flows f WHERE ${whereSql}`,
    params
  );

  params.push(page.limit, page.offset);
  const { rows } = await c.query(
    `${FLOW_SELECT} WHERE ${whereSql}
      ORDER BY f.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { items: rows.map(toFlow), total: countRows[0]?.total ?? 0 };
}

/** A flow with its steps resolved against the API catalog — what the builder renders. */
export async function getFlow(c: TenantClient, id: string): Promise<FlowDto> {
  const { rows } = await c.query(`${FLOW_SELECT} WHERE f.id = $1 AND f.tenant_id = $2`, [
    id,
    c.tenantId,
  ]);
  if (!rows[0]) throw YapiezError.notFound('Flow');
  const flow = toFlow(rows[0]);
  flow.steps = await listSteps(c, id);
  return flow;
}

export async function listSteps(c: TenantClient, flowId: string): Promise<FlowStepDto[]> {
  const { rows } = await c.query(
    `SELECT s.*, a.name AS api_name, a.method AS api_method, a.url AS api_url
       FROM yapiez_flow_steps s
       LEFT JOIN yapiez_apis a ON a.id = s.api_id
      WHERE s.flow_id = $1 AND s.tenant_id = $2
      ORDER BY s.position ASC, s.created_at ASC`,
    [flowId, c.tenantId]
  );
  return rows.map(toFlowStep);
}

export async function createFlow(c: TenantClient, userId: string, input: any): Promise<FlowDto> {
  const { rows } = await c.query(
    `INSERT INTO yapiez_flows
       (tenant_id, name, description, scope_id, project_id, environment_id,
        auth_api_id, auth_config, stop_on_failure, status, tags, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $12)
     RETURNING *`,
    [
      c.tenantId,
      input.name,
      input.description ?? null,
      input.scopeId ?? null,
      input.projectId ?? null,
      input.environmentId ?? null,
      input.authApiId ?? null,
      JSON.stringify(input.authConfig ?? {}),
      input.stopOnFailure ?? true,
      input.status ?? 'Active',
      input.tags ?? [],
      userId,
    ]
  );
  return toFlow(rows[0]);
}

export async function updateFlow(
  c: TenantClient,
  userId: string,
  id: string,
  input: any
): Promise<FlowDto> {
  const { rows } = await c.query(
    `UPDATE yapiez_flows
        SET name            = COALESCE($3, name),
            description     = $4,
            scope_id        = $5,
            project_id      = $6,
            environment_id  = $7,
            auth_api_id     = $8,
            auth_config     = COALESCE($9::jsonb, auth_config),
            stop_on_failure = COALESCE($10, stop_on_failure),
            status          = COALESCE($11, status),
            tags            = COALESCE($12, tags),
            updated_by      = $13
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      id,
      c.tenantId,
      input.name ?? null,
      input.description ?? null,
      input.scopeId ?? null,
      input.projectId ?? null,
      input.environmentId ?? null,
      input.authApiId ?? null,
      input.authConfig ? JSON.stringify(input.authConfig) : null,
      input.stopOnFailure ?? null,
      input.status ?? null,
      input.tags ?? null,
      userId,
    ]
  );
  if (!rows[0]) throw YapiezError.notFound('Flow');
  return toFlow(rows[0]);
}

export async function deleteFlow(c: TenantClient, id: string): Promise<void> {
  const { rowCount } = await c.query(`DELETE FROM yapiez_flows WHERE id = $1 AND tenant_id = $2`, [
    id,
    c.tenantId,
  ]);
  if (!rowCount) throw YapiezError.notFound('Flow');
}

/** Guard every step write: the flow must exist and belong to this tenant. */
async function assertFlowExists(c: TenantClient, flowId: string): Promise<void> {
  const { rows } = await c.query(`SELECT 1 FROM yapiez_flows WHERE id = $1 AND tenant_id = $2`, [
    flowId,
    c.tenantId,
  ]);
  if (!rows[0]) throw YapiezError.notFound('Flow');
}

export async function addStep(c: TenantClient, flowId: string, input: any): Promise<FlowStepDto> {
  await assertFlowExists(c, flowId);

  // Appended to the end unless the caller placed it explicitly.
  const position =
    input.position ??
    (
      await c.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM yapiez_flow_steps WHERE flow_id = $1`,
        [flowId]
      )
    ).rows[0].next;

  const { rows } = await c.query(
    `INSERT INTO yapiez_flow_steps
       (tenant_id, flow_id, api_id, position, step_name, description,
        overrides, extractions, assertions, continue_on_failure, is_enabled, delay_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12)
     RETURNING *`,
    [
      c.tenantId,
      flowId,
      input.apiId,
      position,
      input.stepName ?? null,
      input.description ?? null,
      JSON.stringify(input.overrides ?? {}),
      JSON.stringify(input.extractions ?? []),
      JSON.stringify(input.assertions ?? []),
      input.continueOnFailure ?? false,
      input.isEnabled ?? true,
      input.delayMs ?? 0,
    ]
  );
  return toFlowStep(rows[0]);
}

export async function updateStep(
  c: TenantClient,
  flowId: string,
  stepId: string,
  input: any
): Promise<FlowStepDto> {
  const { rows } = await c.query(
    `UPDATE yapiez_flow_steps
        SET api_id              = COALESCE($4, api_id),
            step_name           = $5,
            description         = $6,
            overrides           = COALESCE($7::jsonb, overrides),
            extractions         = COALESCE($8::jsonb, extractions),
            assertions          = COALESCE($9::jsonb, assertions),
            continue_on_failure = COALESCE($10, continue_on_failure),
            is_enabled          = COALESCE($11, is_enabled),
            delay_ms            = COALESCE($12, delay_ms),
            position            = COALESCE($13, position)
      WHERE id = $1 AND flow_id = $2 AND tenant_id = $3
      RETURNING *`,
    [
      stepId,
      flowId,
      c.tenantId,
      input.apiId ?? null,
      input.stepName ?? null,
      input.description ?? null,
      input.overrides ? JSON.stringify(input.overrides) : null,
      input.extractions ? JSON.stringify(input.extractions) : null,
      input.assertions ? JSON.stringify(input.assertions) : null,
      input.continueOnFailure ?? null,
      input.isEnabled ?? null,
      input.delayMs ?? null,
      input.position ?? null,
    ]
  );
  if (!rows[0]) throw YapiezError.notFound('Step');
  return toFlowStep(rows[0]);
}

export async function deleteStep(c: TenantClient, flowId: string, stepId: string): Promise<void> {
  const { rowCount } = await c.query(
    `DELETE FROM yapiez_flow_steps WHERE id = $1 AND flow_id = $2 AND tenant_id = $3`,
    [stepId, flowId, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound('Step');
  await compactPositions(c, flowId);
}

/**
 * Rewrite the order from a client-supplied list of step ids.
 *
 * Ids not belonging to this flow are ignored rather than trusted, so a stale or
 * tampered list can only reorder steps the caller already owns.
 */
export async function reorderSteps(
  c: TenantClient,
  flowId: string,
  orderedIds: string[]
): Promise<FlowStepDto[]> {
  await assertFlowExists(c, flowId);
  let position = 0;
  for (const stepId of orderedIds) {
    await c.query(
      `UPDATE yapiez_flow_steps SET position = $1 WHERE id = $2 AND flow_id = $3 AND tenant_id = $4`,
      [position, stepId, flowId, c.tenantId]
    );
    position += 1;
  }
  await compactPositions(c, flowId);
  return listSteps(c, flowId);
}

/** Close gaps left by a delete so positions stay 0..n-1. */
async function compactPositions(c: TenantClient, flowId: string): Promise<void> {
  await c.query(
    `WITH ordered AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, created_at ASC) - 1 AS new_position
         FROM yapiez_flow_steps
        WHERE flow_id = $1 AND tenant_id = $2
     )
     UPDATE yapiez_flow_steps s
        SET position = ordered.new_position
       FROM ordered
      WHERE s.id = ordered.id AND s.position <> ordered.new_position`,
    [flowId, c.tenantId]
  );
}

/** Copy a flow, steps and all — the "same thing against staging" case. */
export async function duplicateFlow(
  c: TenantClient,
  userId: string,
  id: string,
  name: string
): Promise<FlowDto> {
  const source = await getFlow(c, id);
  const copy = await createFlow(c, userId, {
    name,
    description: source.description,
    scopeId: source.scopeId,
    projectId: source.projectId,
    environmentId: source.environmentId,
    authApiId: source.authApiId,
    authConfig: source.authConfig,
    stopOnFailure: source.stopOnFailure,
    status: 'Draft',
    tags: source.tags,
  });

  for (const step of source.steps ?? []) {
    await addStep(c, copy.id, {
      apiId: step.apiId,
      position: step.position,
      stepName: step.stepName,
      description: step.description,
      overrides: step.overrides,
      extractions: step.extractions,
      assertions: step.assertions,
      continueOnFailure: step.continueOnFailure,
      isEnabled: step.isEnabled,
      delayMs: step.delayMs,
    });
  }

  return getFlow(c, copy.id);
}
