// src/modules/yapiez/repositories/environment.repo.ts
// Environments and their variables — {{baseUrl}}, {{username}}, {{password}}…

import { TenantClient } from '../db/pool';
import { YapiezError } from '../types';
import { EnvironmentDto, SECRET_MASK, toEnvironment } from './mappers';
import { EnvironmentCreateInput, EnvironmentUpdateInput } from '../validators';

/**
 * `yapiez_environments_name_uidx` is on (tenant_id, lower(name)), so a
 * case-different duplicate lands here as a Postgres unique violation rather
 * than something the caller could have checked for.
 */
function rethrowDuplicate(err: any): never {
  if (err?.code === '23505') {
    throw YapiezError.conflict('An environment with that name already exists.');
  }
  throw err;
}

export async function listEnvironments(
  c: TenantClient,
  filters: { projectId?: string } = {}
): Promise<EnvironmentDto[]> {
  const params: any[] = [c.tenantId];
  let projectFilter = '';
  if (filters.projectId) {
    // A NULL project means "shared" — a common sandbox should be offered from
    // every project rather than hidden by the filter.
    params.push(filters.projectId);
    projectFilter = ` AND (project_id = $${params.length} OR project_id IS NULL)`;
  }

  const { rows } = await c.query(
    `SELECT * FROM yapiez_environments
      WHERE tenant_id = $1${projectFilter}
      ORDER BY is_default DESC, project_id NULLS LAST, name ASC`,
    params
  );
  return rows.map((r) => toEnvironment(r));
}

export async function getEnvironment(c: TenantClient, id: string): Promise<EnvironmentDto> {
  const { rows } = await c.query(
    `SELECT * FROM yapiez_environments WHERE id = $1 AND tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rows[0]) throw YapiezError.notFound('Environment');
  return toEnvironment(rows[0]);
}

/**
 * The runner's read: secrets intact, because it is about to send them.
 * Never expose the result of this through a controller.
 */
export async function getEnvironmentForRun(
  c: TenantClient,
  id: string
): Promise<EnvironmentDto> {
  const { rows } = await c.query(
    `SELECT * FROM yapiez_environments WHERE id = $1 AND tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rows[0]) throw YapiezError.notFound('Environment');
  return toEnvironment(rows[0], { unmasked: true });
}

export async function getDefaultEnvironment(c: TenantClient): Promise<EnvironmentDto | null> {
  const { rows } = await c.query(
    `SELECT * FROM yapiez_environments
      WHERE tenant_id = $1
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1`,
    [c.tenantId]
  );
  return rows[0] ? toEnvironment(rows[0], { unmasked: true }) : null;
}

/** Only one environment per tenant may carry the default flag. */
async function clearOtherDefaults(c: TenantClient, keepId: string): Promise<void> {
  await c.query(
    `UPDATE yapiez_environments SET is_default = FALSE WHERE tenant_id = $1 AND id <> $2`,
    [c.tenantId, keepId]
  );
}

export async function createEnvironment(
  c: TenantClient,
  userId: string,
  input: EnvironmentCreateInput
): Promise<EnvironmentDto> {
  try {
    const { rows } = await c.query(
      `INSERT INTO yapiez_environments (tenant_id, name, project_id, base_url, description, variables, is_default, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $8)
       RETURNING *`,
      [
        c.tenantId,
        input.name,
        input.projectId ?? null,
        input.baseUrl,
        input.description ?? null,
        JSON.stringify(input.variables ?? []),
        input.isDefault ?? false,
        userId,
      ]
    );
    if (input.isDefault) await clearOtherDefaults(c, rows[0].id);
    return toEnvironment(rows[0]);
  } catch (err) {
    rethrowDuplicate(err);
  }
}

/**
 * Update, preserving secrets the client never received.
 *
 * The browser is sent SECRET_MASK in place of a secret value. If that marker
 * comes back unchanged, the stored value is kept; any other value is a genuine
 * edit. Without this, opening and saving an environment would wipe every
 * password in it.
 */
export async function updateEnvironment(
  c: TenantClient,
  userId: string,
  id: string,
  input: EnvironmentUpdateInput
): Promise<EnvironmentDto> {
  const current = await getEnvironmentForRun(c, id);

  let variables = input.variables;
  if (variables) {
    const previous = new Map(current.variables.map((v) => [v.key, v]));
    variables = variables.map((v) =>
      v.value === SECRET_MASK ? { ...v, value: previous.get(v.key)?.value ?? '' } : v
    );
  }

  const { rows } = await c.query(
    `UPDATE yapiez_environments
        SET name        = COALESCE($3, name),
            base_url    = COALESCE($4, base_url),
            description = $5,
            -- Unconditional so an environment can be made shared again.
            project_id  = $6,
            variables   = COALESCE($7::jsonb, variables),
            is_default  = COALESCE($8, is_default),
            updated_by  = $9
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [
      id,
      c.tenantId,
      input.name ?? null,
      input.baseUrl ?? null,
      input.description ?? current.description,
      input.projectId ?? null,
      variables ? JSON.stringify(variables) : null,
      input.isDefault ?? null,
      userId,
    ]
  );
  if (!rows[0]) throw YapiezError.notFound('Environment');
  if (input.isDefault) await clearOtherDefaults(c, id);
  return toEnvironment(rows[0]);
}

export async function deleteEnvironment(c: TenantClient, id: string): Promise<void> {
  const { rowCount } = await c.query(
    `DELETE FROM yapiez_environments WHERE id = $1 AND tenant_id = $2`,
    [id, c.tenantId]
  );
  if (!rowCount) throw YapiezError.notFound('Environment');
}
