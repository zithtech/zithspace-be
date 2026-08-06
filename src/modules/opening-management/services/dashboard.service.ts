// src/modules/opening-management/services/dashboard.service.ts
//
// Phase 6 — the hiring dashboard.
//
// Everything here is READ-ONLY aggregation over Phases 1–5. No new tables, no
// snapshot columns, no denormalised counters: a counter that can drift is worse
// than a query that takes an extra millisecond, and the numbers must agree with
// the pipeline the recruiter is looking at.
//
// If a very large tenant ever makes these slow, the fix is a materialised view
// refreshed on a schedule — NOT counters maintained by application code, which
// would put the dashboard and the pipeline permanently at risk of disagreeing.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/dashboard.repo';
import {
  Actor,
  DashboardSummary,
  OpeningMetrics,
  Paginated,
  RecruiterLoad,
  SourceEffectiveness,
  StageVelocity,
} from '../types';
import { DashboardFilterQuery, DashboardListQuery } from '../validators/dashboard.validator';

function toFilters(query: DashboardFilterQuery): repo.DashboardFilters {
  return {
    status: query.status,
    priority: query.priority,
    employmentType: query.employmentType,
    departmentId: query.departmentId,
    clientId: query.clientId,
    projectId: query.projectId,
    hiringManagerId: query.hiringManagerId,
    recruiterId: query.recruiterId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    search: query.search,
    includeClosed: query.includeClosed,
  };
}

/** Tenant-wide totals for the current filter. */
export async function getSummary(
  actor: Actor,
  query: DashboardFilterQuery
): Promise<DashboardSummary> {
  return withTenant(actor.tenantId, (client) => repo.summary(client, toFilters(query)));
}

/**
 * One row per opening with its funnel — the dashboard's main table.
 *
 * Computed in a single statement for the whole page, not one query per row.
 */
export async function getOpeningMetrics(
  actor: Actor,
  query: DashboardListQuery
): Promise<Paginated<OpeningMetrics>> {
  return withTenant(actor.tenantId, async (client) => {
    const filters = toFilters(query);
    const total = await repo.countOpenings(client, filters);
    const items = await repo.openingMetrics(client, filters, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  });
}

/** Which intake channels actually produce hires. */
export async function getSourceEffectiveness(
  actor: Actor,
  query: DashboardFilterQuery
): Promise<SourceEffectiveness[]> {
  return withTenant(actor.tenantId, (client) =>
    repo.sourceEffectiveness(client, toFilters(query))
  );
}

/** Where candidates spend their time — the bottleneck view. */
export async function getStageVelocity(
  actor: Actor,
  query: DashboardFilterQuery
): Promise<StageVelocity[]> {
  return withTenant(actor.tenantId, (client) => repo.stageVelocity(client, toFilters(query)));
}

/** Openings and outcomes per recruiter. */
export async function getRecruiterLoad(
  actor: Actor,
  query: DashboardFilterQuery
): Promise<RecruiterLoad[]> {
  return withTenant(actor.tenantId, (client) => repo.recruiterLoad(client, toFilters(query)));
}

/**
 * Everything the landing page needs in ONE round trip. The panels share a
 * filter, so fetching them together also guarantees they are consistent with
 * each other — four separate requests could straddle a pipeline change and show
 * numbers that do not add up.
 */
export async function getOverview(
  actor: Actor,
  query: DashboardListQuery
): Promise<{
  summary: DashboardSummary;
  openings: Paginated<OpeningMetrics>;
  sources: SourceEffectiveness[];
  velocity: StageVelocity[];
  recruiters: RecruiterLoad[];
}> {
  return withTenant(actor.tenantId, async (client) => {
    const filters = toFilters(query);

    const total = await repo.countOpenings(client, filters);
    const [summary, items, sources, velocity, recruiters] = await Promise.all([
      repo.summary(client, filters),
      repo.openingMetrics(client, filters, {
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
      repo.sourceEffectiveness(client, filters),
      repo.stageVelocity(client, filters),
      repo.recruiterLoad(client, filters),
    ]);

    return {
      summary,
      openings: {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      sources,
      velocity,
      recruiters,
    };
  });
}
