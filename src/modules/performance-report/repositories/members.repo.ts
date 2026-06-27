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

  const whereSql = where.join(' AND ');

  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS total FROM users u WHERE ${whereSql}`,
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
       FROM users u
       LEFT JOIN positions p   ON p.id = u.position_id
       LEFT JOIN departments d ON d.id = p.department_id
       LEFT JOIN grades g      ON g.id = p.grade_id
      WHERE ${whereSql}
      ORDER BY u.name ASC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { rows: rows as MemberCard[], total };
}
