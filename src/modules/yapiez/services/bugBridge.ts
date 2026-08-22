// src/modules/yapiez/services/bugBridge.ts
//
// The QA Space join on the failure side: a failed step becomes a BugList entry
// without QA retyping the evidence.
//
// Yapiez writes into `bugs` directly rather than calling the bug-list HTTP API
// (there is no internal client, and a self-request would need a token). It uses
// only the columns from 002_create_bug_list.sql, so a tenant that has not run
// the later bug-list migrations is still served.
//
// Note the id types: `bugs` is a Prisma-era table with TEXT ids and a TEXT
// tenant_id, while the yapiez_* tables use UUID. The same tenant value is valid
// in both; do not "fix" the cast.

import { TenantClient } from '../db/pool';
import { RunDto, RunStepDto } from '../repositories/mappers';
import { YapiezError } from '../types';
import { RaiseBugRequest } from '../validators';

/** Validated by raiseBugSchema before it reaches here — see validators/index.ts. */
export type RaiseBugInput = RaiseBugRequest;

/** BUG-#### scoped to the tenant — the same sequence the Bug List page uses. */
async function nextBugNumber(c: TenantClient): Promise<string> {
  const { rows } = await c.query(
    `SELECT bug_number FROM bugs
      WHERE tenant_id = $1 AND bug_number IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [c.tenantId]
  );
  let next = 1;
  if (rows[0]?.bug_number) {
    const parts = String(rows[0].bug_number).split('-');
    const last = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(last)) next = last + 1;
  }
  return `BUG-${String(next).padStart(4, '0')}`;
}

/**
 * The default description for a bug raised from a run step.
 *
 * Everything a developer needs to reproduce it is in the body — endpoint,
 * status, the failed assertions and the response — because a bug that just says
 * "Update User failed" costs a round-trip to be useful.
 */
export function describeFailure(run: RunDto, step: RunStepDto): string {
  const lines: string[] = [];

  lines.push(`**API flow step failed:** ${step.stepName}`);
  lines.push('');
  lines.push(`- **Flow:** ${run.flowName ?? run.flowId} (run #${run.runNumber})`);
  if (run.environmentName) lines.push(`- **Environment:** ${run.environmentName}`);
  lines.push(`- **Request:** \`${step.method ?? ''} ${step.resolvedUrl ?? ''}\``);
  lines.push(`- **Status code:** ${step.statusCode ?? 'no response'}`);
  if (step.durationMs != null) lines.push(`- **Execution time:** ${step.durationMs} ms`);

  const failedAssertions = (step.assertionResults as any[]).filter((a) => a && !a.passed);
  if (failedAssertions.length) {
    lines.push('');
    lines.push('**Failed assertions**');
    for (const assertion of failedAssertions) {
      lines.push(`- ${assertion.name}: ${assertion.message}`);
    }
  }

  if (step.error) {
    lines.push('');
    lines.push(`**Error:** ${step.error}`);
  }

  if (step.requestBody) {
    lines.push('');
    lines.push('**Request payload**');
    lines.push('```json');
    lines.push(step.requestBody.slice(0, 4000));
    lines.push('```');
  }

  if (step.responseBody) {
    lines.push('');
    lines.push('**Response payload**');
    lines.push('```json');
    lines.push(step.responseBody.slice(0, 4000));
    lines.push('```');
  }

  return lines.join('\n');
}

/**
 * Create the bug and link it to the run step it came from.
 *
 * Refuses to raise a second bug for the same step — the step already carries a
 * link, and QA wanting a separate report can raise it from the Bug List.
 */
export async function raiseBugForStep(
  c: TenantClient,
  userId: string,
  run: RunDto,
  step: RunStepDto,
  input: RaiseBugInput
): Promise<{ id: string; bugNumber: string }> {
  if (step.bugId) {
    throw YapiezError.conflict('This step already has a bug linked to it.');
  }

  const { rows: sheetRows } = await c.query(
    `SELECT s.id
       FROM bug_sheets s
      WHERE s.id = $1 AND s.folder_id = $2 AND s.tenant_id = $3`,
    [input.sheetId, input.folderId, c.tenantId]
  );
  if (!sheetRows[0]) throw YapiezError.notFound('Bug sheet');

  const bugNumber = await nextBugNumber(c);
  const title =
    input.title || `${step.method ?? 'API'} ${step.stepName} failed in ${run.flowName ?? 'flow'}`;

  const { rows } = await c.query(
    `INSERT INTO bugs
       (tenant_id, folder_id, sheet_id, bug_number, title, description, module,
        bug_type, severity, status, tags, assignee_id, created_by_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11, $12)
     RETURNING id, bug_number`,
    [
      c.tenantId,
      input.folderId,
      input.sheetId,
      bugNumber,
      title.slice(0, 300),
      input.description,
      input.module ?? run.flowName ?? null,
      input.bugType ?? 'api',
      input.severity ?? 'major',
      ['yapiez'],
      input.assigneeId ?? null,
      userId,
    ]
  );

  await c.query(
    `UPDATE yapiez_flow_run_steps SET bug_id = $1 WHERE id = $2 AND tenant_id = $3`,
    [rows[0].id, step.id, c.tenantId]
  );

  return { id: rows[0].id, bugNumber: rows[0].bug_number };
}

/** Folders + sheets a bug can be filed into, for the raise-bug picker. */
export async function bugTargets(c: TenantClient, projectId?: string | null): Promise<any[]> {
  const params: any[] = [c.tenantId];
  let projectFilter = '';
  if (projectId) {
    params.push(projectId);
    projectFilter = ` AND (f.project_id = $2 OR f.project_id IS NULL)`;
  }

  const { rows } = await c.query(
    `SELECT f.id AS folder_id, f.name AS folder_name,
            s.id AS sheet_id, s.name AS sheet_name
       FROM bug_folders f
       JOIN bug_sheets s ON s.folder_id = f.id
      WHERE f.tenant_id = $1${projectFilter}
      ORDER BY f.name ASC, s.name ASC`,
    params
  );

  const folders = new Map<string, any>();
  for (const row of rows) {
    if (!folders.has(row.folder_id)) {
      folders.set(row.folder_id, { id: row.folder_id, name: row.folder_name, sheets: [] });
    }
    folders.get(row.folder_id).sheets.push({ id: row.sheet_id, name: row.sheet_name });
  }
  return Array.from(folders.values());
}
