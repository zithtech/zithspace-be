// src/modules/performance-report/services/members.service.ts

import { withTenant } from '../db/pool';
import * as repo from '../repositories/members.repo';
import { Actor } from '../types';
import { MemberListQuery } from '../validators/members.validator';

export async function listMembers(actor: Actor, query: MemberListQuery) {
  return withTenant(actor.tenantId, async (client) => {
    const { rows, total } = await repo.findMembers(client, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      projectId: query.projectId,
    });
    return {
      data: rows,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  });
}
