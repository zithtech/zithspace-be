// src/modules/project-agreements/repositories/project.repo.ts
//
// The ONE place this module reads Prisma-owned tables.
//
// `projects` and `users` belong to schema.prisma, not to us. They are read
// here — never written, never joined into a pa_* query elsewhere — so that the
// coupling is a single file you can point at. Everything the module needs from
// a project is copied onto the agreement at creation (project_name,
// project_code), which is also why a renamed project does not rewrite the
// header of a document somebody already signed.
//
// NOTE ON RLS: these tables carry no row-level policy, so the explicit
// `tenant_id = $1` filter below is the only thing keeping one tenant out of
// another's project list. Do not remove it.

import { TenantClient } from '../db/pool';
import { ProjectContext } from '../types';

const COLUMNS = `
  p.id,
  p.name,
  p.code,
  p.description,
  p.status,
  to_char(p.start_date, 'YYYY-MM-DD') AS "startDate",
  to_char(p.end_date,   'YYYY-MM-DD') AS "endDate",
  u.name       AS "managerName",
  u.work_email AS "managerEmail"
`;

/** Projects a document can be raised against, newest first. */
export async function listProjects(
  client: TenantClient,
  search?: string
): Promise<ProjectContext[]> {
  const params: any[] = [client.tenantId];
  const where = ['p.tenant_id = $1'];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(
      `(lower(p.name) LIKE $${params.length} OR lower(COALESCE(p.code, '')) LIKE $${params.length})`
    );
  }

  const { rows } = await client.query<ProjectContext>(
    `SELECT ${COLUMNS}
       FROM projects p
       LEFT JOIN users u ON u.id = p.project_manager_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT 500`,
    params
  );
  return rows;
}

export async function getProject(
  client: TenantClient,
  projectId: string
): Promise<ProjectContext | null> {
  const { rows } = await client.query<ProjectContext>(
    `SELECT ${COLUMNS}
       FROM projects p
       LEFT JOIN users u ON u.id = p.project_manager_id
      WHERE p.tenant_id = $1 AND p.id = $2`,
    [client.tenantId, projectId]
  );
  return rows[0] ?? null;
}
