// src/modules/performance-report/repositories/members.repo.ts
//
// Paginated member directory for the Reports landing grid. Department + grade
// come through the user's position (positions.department_id / grade_id).

import { TenantClient } from '../db/pool';

export interface MemberCard {
  id: string;
  name: string;
  avatarUrl: string | null;
  workEmail: string | null;
  position: string | null;
  department: string | null;
  grade: string | null;
}

export interface MemberListFilters {
  page: number;
  limit: number;
  search?: string;
  projectId?: string;
  positionId?: string;
  departmentId?: string;
}

/** One option in the directory filter dropdowns, with how many members it covers. */
export interface MemberFilterOption {
  id: string;
  label: string;
  count: number;
}

export async function findMembers(
  client: TenantClient,
  filters: MemberListFilters
): Promise<{ rows: MemberCard[]; total: number }> {
  const where: string[] = ['u.tenant_id = $1', 'u.is_active = true'];
  const params: any[] = [client.tenantId];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.work_email ILIKE $${params.length})`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(
      `EXISTS (SELECT 1 FROM project_members pm WHERE pm.user_id = u.id AND pm.project_id = $${params.length})`
    );
  }
  if (filters.positionId) {
    params.push(filters.positionId);
    where.push(`u.position_id = $${params.length}`);
  }
  if (filters.departmentId) {
    params.push(filters.departmentId);
    where.push(`p.department_id = $${params.length}`);
  }

  const whereSql = where.join(' AND ');
  // positions is joined in BOTH queries so the department filter can reference it.
  const fromSql = `users u LEFT JOIN positions p ON p.id = u.position_id`;

  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS total FROM ${fromSql} WHERE ${whereSql}`,
    params
  );
  const total = countRows[0]?.total ?? 0;

  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];

  const { rows } = await client.query(
    `SELECT
        u.id,
        u.name,
        u.avatar_url   AS "avatarUrl",
        u.work_email   AS "workEmail",
        p.title        AS "position",
        d.name         AS "department",
        g.name         AS "grade"
       FROM ${fromSql}
       LEFT JOIN departments d ON d.id = p.department_id
       LEFT JOIN grades g      ON g.id = p.grade_id
      WHERE ${whereSql}
      ORDER BY u.name ASC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { rows: rows as MemberCard[], total };
}

/**
 * Positions + departments actually held by active members, each with a member
 * count. Feeds the directory's Position / Department filter dropdowns so they
 * only ever offer values that return results.
 */
export async function findFilterOptions(
  client: TenantClient
): Promise<{ positions: MemberFilterOption[]; departments: MemberFilterOption[] }> {
  // Sequential: both run on the same transaction-scoped connection.
  const positions = await client.query(
    `SELECT p.id, p.title AS label, COUNT(u.id)::int AS count
       FROM users u
       JOIN positions p ON p.id = u.position_id
      WHERE u.tenant_id = $1 AND u.is_active = true
      GROUP BY p.id, p.title
      ORDER BY p.title ASC`,
    [client.tenantId]
  );
  const departments = await client.query(
    `SELECT d.id, d.name AS label, COUNT(u.id)::int AS count
       FROM users u
       JOIN positions p   ON p.id = u.position_id
       JOIN departments d ON d.id = p.department_id
      WHERE u.tenant_id = $1 AND u.is_active = true
      GROUP BY d.id, d.name
      ORDER BY d.name ASC`,
    [client.tenantId]
  );

  return {
    positions: positions.rows as MemberFilterOption[],
    departments: departments.rows as MemberFilterOption[],
  };
}
