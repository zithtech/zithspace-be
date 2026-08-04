// src/modules/opening-management/repositories/dashboard.repo.ts
//
// Phase 6 — read-only aggregation over what Phases 1–5 already store. This file
// adds no tables and no columns; every number here is derived.
//
// THE ONE RULE THAT SHAPES EVERYTHING: no N+1. The dashboard shows a funnel per
// opening, and the obvious implementation (list openings, then one funnel query
// each) turns a 50-row page into 51 round trips. Every query below computes its
// metric for the WHOLE selection in a single statement, using CTEs and FILTER
// aggregates.
//
// "Screened / interview / offers" are FURTHEST-REACHED counts, not live ones —
// someone holding an offer was screened and interviewed on the way. That is what
// the `reached` CTE is for; a live `stage` column cannot answer it.

import { TenantClient } from '../db/pool';
import {
  DashboardSummary,
  OpeningMetrics,
  RecruiterLoad,
  SourceEffectiveness,
  StageVelocity,
} from '../types';

export interface DashboardFilters {
  status?: string[];
  priority?: string[];
  employmentType?: string[];
  departmentId?: string;
  clientId?: string;
  projectId?: string;
  hiringManagerId?: string;
  recruiterId?: string;
  /** Openings created on/after this date (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** Default true — terminal openings are excluded unless asked for. */
  includeClosed?: boolean;
}

/**
 * Build the opening-selection predicate. `params` is seeded with the tenant id
 * at $1 by the caller and comes back holding every bound value.
 */
function buildOpeningWhere(filters: DashboardFilters, params: any[]): string {
  const conditions = ['o.tenant_id = $1', 'o.deleted_at IS NULL'];
  const push = (v: any): string => {
    params.push(v);
    return `$${params.length}`;
  };

  if (!filters.includeClosed) {
    conditions.push(`o.status NOT IN ('cancelled', 'closed')`);
  }
  if (filters.status?.length) conditions.push(`o.status = ANY(${push(filters.status)})`);
  if (filters.priority?.length) conditions.push(`o.priority = ANY(${push(filters.priority)})`);
  if (filters.employmentType?.length)
    conditions.push(`o.employment_type = ANY(${push(filters.employmentType)})`);
  if (filters.departmentId) conditions.push(`o.department_id = ${push(filters.departmentId)}`);
  if (filters.clientId) conditions.push(`o.client_id = ${push(filters.clientId)}`);
  if (filters.projectId) conditions.push(`o.project_id = ${push(filters.projectId)}`);
  if (filters.hiringManagerId)
    conditions.push(`o.hiring_manager_id = ${push(filters.hiringManagerId)}`);
  if (filters.dateFrom) conditions.push(`o.created_at >= ${push(filters.dateFrom)}::date`);
  if (filters.dateTo)
    conditions.push(`o.created_at < (${push(filters.dateTo)}::date + interval '1 day')`);
  if (filters.search) {
    const p = push(`%${filters.search}%`);
    conditions.push(`(o.job_title ILIKE ${p} OR o.opening_code ILIKE ${p})`);
  }
  if (filters.recruiterId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM om_opening_recruiters r
                WHERE r.opening_id = o.id AND r.recruiter_id = ${push(filters.recruiterId)})`
    );
  }
  return conditions.join(' AND ');
}

/**
 * The shared prelude: the selected openings, their applications, and every stage
 * each application has ever reached. Three CTEs that the metric queries below
 * build on, so the definition of "selected" and "reached" lives in one place.
 */
function scopedCte(where: string): string {
  return `
    scoped AS (
      SELECT o.* FROM om_openings o WHERE ${where}
    ),
    apps AS (
      SELECT a.id, a.opening_id, a.stage, a.source, a.applied_at
        FROM om_opening_applications a
        JOIN scoped s ON s.id = a.opening_id
       WHERE a.deleted_at IS NULL
    ),
    reached AS (
      -- Current stage plus every stage in the history: the union is what makes
      -- "was screened at some point" answerable.
      SELECT id, opening_id, stage FROM apps
      UNION
      SELECT h.application_id, apps.opening_id, h.to_stage
        FROM om_application_stage_history h
        JOIN apps ON apps.id = h.application_id
    )
  `;
}

// Reused so the stage groupings cannot drift between the row query and the
// summary query.
const SCREENED = `('screening','shortlisted','interview','offer','hired')`;
const INTERVIEWED = `('interview','offer','hired')`;
const OFFERED = `('offer','hired')`;

/**
 * Mean days from application to hire, per opening.
 *
 * Timed from `applied_at` to the moment the application entered 'hired' — read
 * from the stage history, because the live row only knows it is hired now, not
 * when that happened (a later edit would move `stage_changed_at`).
 */
const TIME_TO_HIRE_CTE = `
  hire_times AS (
    SELECT apps.opening_id,
           EXTRACT(EPOCH FROM (MIN(h.changed_at) - apps.applied_at)) / 86400 AS days_to_hire
      FROM om_application_stage_history h
      JOIN apps ON apps.id = h.application_id
     WHERE h.to_stage = 'hired'
     GROUP BY apps.opening_id, apps.id, apps.applied_at
  )
`;

// ─── Per-opening rows ───────────────────────────────────────────────────────

export async function openingMetrics(
  client: TenantClient,
  filters: DashboardFilters,
  opts: { limit: number; offset: number; sortBy: string; sortOrder: 'asc' | 'desc' }
): Promise<OpeningMetrics[]> {
  const params: any[] = [client.tenantId];
  const where = buildOpeningWhere(filters, params);

  const SORT: Record<string, string> = {
    applications: 'applications',
    joined: 'joined',
    openPositions: 's.number_of_positions',
    ageDays: 'age_days',
    jobTitle: 's.job_title',
    createdAt: 's.created_at',
    priority: `CASE s.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`,
  };
  const sortCol = SORT[opts.sortBy] ?? SORT.createdAt;
  const direction = opts.sortOrder === 'asc' ? 'ASC' : 'DESC';

  params.push(opts.limit, opts.offset);

  const { rows } = await client.query(
    `WITH ${scopedCte(where)},
     ${TIME_TO_HIRE_CTE},
     live AS (
       SELECT opening_id,
              COUNT(*) AS applications,
              COUNT(*) FILTER (WHERE stage = 'hired')     AS joined,
              COUNT(*) FILTER (WHERE stage = 'rejected')  AS rejected,
              COUNT(*) FILTER (WHERE stage = 'withdrawn') AS withdrawn
         FROM apps GROUP BY opening_id
     ),
     funnel AS (
       SELECT opening_id,
              COUNT(DISTINCT id) FILTER (WHERE stage IN ${SCREENED})    AS screened,
              COUNT(DISTINCT id) FILTER (WHERE stage IN ${INTERVIEWED}) AS interview,
              COUNT(DISTINCT id) FILTER (WHERE stage IN ${OFFERED})     AS offers
         FROM reached GROUP BY opening_id
     ),
     hire_avg AS (
       SELECT opening_id, AVG(days_to_hire) AS avg_days_to_hire
         FROM hire_times GROUP BY opening_id
     ),
     primary_recruiter AS (
       SELECT r.opening_id, u.name AS recruiter_name
         FROM om_opening_recruiters r
         LEFT JOIN users u ON u.id = r.recruiter_id
        WHERE r.is_primary
     )
     SELECT s.id AS opening_id, s.opening_code, s.job_title, s.status, s.priority,
            s.number_of_positions,
            d.name AS department_name,
            COALESCE(rc.client_name, cv.company_name) AS client_name,
            hm.name AS hiring_manager_name,
            pr.recruiter_name AS primary_recruiter_name,
            COALESCE(live.applications, 0) AS applications,
            COALESCE(funnel.screened, 0)   AS screened,
            COALESCE(funnel.interview, 0)  AS interview,
            COALESCE(funnel.offers, 0)     AS offers,
            COALESCE(live.joined, 0)       AS joined,
            COALESCE(live.rejected, 0)     AS rejected,
            COALESCE(live.withdrawn, 0)    AS withdrawn,
            FLOOR(EXTRACT(EPOCH FROM (now() - s.created_at)) / 86400) AS age_days,
            CASE WHEN COALESCE(s.posted_internally_at, s.posted_externally_at) IS NULL THEN NULL
                 ELSE FLOOR(EXTRACT(EPOCH FROM (now() - LEAST(
                        COALESCE(s.posted_internally_at, s.posted_externally_at),
                        COALESCE(s.posted_externally_at, s.posted_internally_at)
                      ))) / 86400)
            END AS days_since_posted,
            hire_avg.avg_days_to_hire
       FROM scoped s
       LEFT JOIN live  ON live.opening_id = s.id
       LEFT JOIN funnel ON funnel.opening_id = s.id
       LEFT JOIN hire_avg ON hire_avg.opening_id = s.id
       LEFT JOIN primary_recruiter pr ON pr.opening_id = s.id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN recruitment_client_basic_information rc ON rc.id = s.client_id
       LEFT JOIN clients_v2 cv ON cv.id = s.client_id
       LEFT JOIN users hm ON hm.id = s.hiring_manager_id
      ORDER BY ${sortCol} ${direction}, s.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows.map((r: any) => {
    const joined = Number(r.joined);
    const positions = Number(r.number_of_positions);
    return {
      openingId: r.opening_id,
      openingCode: r.opening_code,
      jobTitle: r.job_title,
      status: r.status,
      priority: r.priority,
      departmentName: r.department_name,
      clientName: r.client_name,
      hiringManagerName: r.hiring_manager_name,
      primaryRecruiterName: r.primary_recruiter_name,
      openPositions: positions,
      remainingPositions: Math.max(0, positions - joined),
      applications: Number(r.applications),
      screened: Number(r.screened),
      interview: Number(r.interview),
      offers: Number(r.offers),
      joined,
      rejected: Number(r.rejected),
      withdrawn: Number(r.withdrawn),
      ageDays: Number(r.age_days),
      daysSincePosted: r.days_since_posted === null ? null : Number(r.days_since_posted),
      avgDaysToHire:
        r.avg_days_to_hire === null ? null : Math.round(Number(r.avg_days_to_hire) * 10) / 10,
    };
  });
}

export async function countOpenings(
  client: TenantClient,
  filters: DashboardFilters
): Promise<number> {
  const params: any[] = [client.tenantId];
  const where = buildOpeningWhere(filters, params);
  const { rows } = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM om_openings o WHERE ${where}`,
    params
  );
  return Number(rows[0].total);
}

// ─── Summary ────────────────────────────────────────────────────────────────

export async function summary(
  client: TenantClient,
  filters: DashboardFilters
): Promise<DashboardSummary> {
  const params: any[] = [client.tenantId];
  const where = buildOpeningWhere(filters, params);

  const { rows } = await client.query(
    `WITH ${scopedCte(where)},
     ${TIME_TO_HIRE_CTE},
     per_opening AS (
       SELECT s.id, s.number_of_positions,
              COALESCE((SELECT COUNT(*) FROM apps WHERE apps.opening_id = s.id AND stage = 'hired'), 0) AS joined
         FROM scoped s
     )
     SELECT
       (SELECT COUNT(*) FROM scoped)::text AS openings,
       (SELECT COALESCE(SUM(number_of_positions), 0) FROM scoped)::text AS open_positions,
       (SELECT COALESCE(SUM(GREATEST(0, number_of_positions - joined)), 0) FROM per_opening)::text AS remaining_positions,
       (SELECT COUNT(*) FROM apps)::text AS applications,
       (SELECT COUNT(DISTINCT id) FROM reached WHERE stage IN ${SCREENED})::text    AS screened,
       (SELECT COUNT(DISTINCT id) FROM reached WHERE stage IN ${INTERVIEWED})::text AS interview,
       (SELECT COUNT(DISTINCT id) FROM reached WHERE stage IN ${OFFERED})::text     AS offers,
       (SELECT COUNT(*) FROM apps WHERE stage = 'hired')::text     AS joined,
       (SELECT COUNT(*) FROM apps WHERE stage = 'rejected')::text  AS rejected,
       (SELECT COUNT(*) FROM apps WHERE stage = 'withdrawn')::text AS withdrawn,
       (SELECT AVG(days_to_hire) FROM hire_times) AS avg_days_to_hire`,
    params
  );

  const r = rows[0];
  const byStatus = await groupOpenings(client, filters, 'status');
  const byPriority = await groupOpenings(client, filters, 'priority');

  const offers = Number(r.offers);
  const joined = Number(r.joined);

  return {
    openings: Number(r.openings),
    openPositions: Number(r.open_positions),
    remainingPositions: Number(r.remaining_positions),
    applications: Number(r.applications),
    screened: Number(r.screened),
    interview: Number(r.interview),
    offers,
    joined,
    rejected: Number(r.rejected),
    withdrawn: Number(r.withdrawn),
    openingsByStatus: byStatus,
    openingsByPriority: byPriority,
    avgDaysToHire:
      r.avg_days_to_hire === null ? null : Math.round(Number(r.avg_days_to_hire) * 10) / 10,
    // Of everyone who reached an offer, how many took it.
    offerAcceptanceRate: offers === 0 ? null : Math.round((joined / offers) * 1000) / 10,
  };
}

/** `column` is a fixed internal literal — never caller-supplied. */
async function groupOpenings(
  client: TenantClient,
  filters: DashboardFilters,
  column: 'status' | 'priority'
): Promise<Record<string, number>> {
  const params: any[] = [client.tenantId];
  const where = buildOpeningWhere(filters, params);
  const { rows } = await client.query<{ key: string; total: string }>(
    `SELECT o.${column} AS key, COUNT(*)::text AS total
       FROM om_openings o WHERE ${where} GROUP BY o.${column}`,
    params
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = Number(r.total);
  return out;
}

// ─── Source effectiveness ───────────────────────────────────────────────────

export async function sourceEffectiveness(
  client: TenantClient,
  filters: DashboardFilters
): Promise<SourceEffectiveness[]> {
  const params: any[] = [client.tenantId];
  const where = buildOpeningWhere(filters, params);

  const { rows } = await client.query(
    `WITH ${scopedCte(where)},
     by_source AS (
       SELECT source,
              COUNT(*) AS applications,
              COUNT(*) FILTER (WHERE stage = 'hired')    AS joined,
              COUNT(*) FILTER (WHERE stage = 'rejected') AS rejected
         FROM apps GROUP BY source
     ),
     reached_source AS (
       SELECT a.source, r.id, r.stage
         FROM reached r JOIN apps a ON a.id = r.id
     )
     SELECT b.source, b.applications::text, b.joined::text, b.rejected::text,
            (SELECT COUNT(DISTINCT id) FROM reached_source rs
              WHERE rs.source = b.source AND rs.stage IN ${INTERVIEWED})::text AS interview,
            (SELECT COUNT(DISTINCT id) FROM reached_source rs
              WHERE rs.source = b.source AND rs.stage IN ${OFFERED})::text AS offers
       FROM by_source b
      ORDER BY b.applications DESC`,
    params
  );

  return rows.map((r: any) => {
    const applications = Number(r.applications);
    const joined = Number(r.joined);
    return {
      source: r.source,
      applications,
      interview: Number(r.interview),
      offers: Number(r.offers),
      joined,
      rejected: Number(r.rejected),
      conversionRate:
        applications === 0 ? 0 : Math.round((joined / applications) * 1000) / 10,
    };
  });
}

// ─── Velocity ───────────────────────────────────────────────────────────────

/**
 * Mean time an application sits in each stage before moving on.
 *
 * LEAD() over the per-application timeline gives each entry its successor; the
 * gap between them is the time spent in that stage. Applications still sitting
 * in a stage have no successor and are excluded — you cannot average a duration
 * that has not finished, and including them as "0 days" would flatter the
 * numbers badly.
 */
export async function stageVelocity(
  client: TenantClient,
  filters: DashboardFilters
): Promise<StageVelocity[]> {
  const params: any[] = [client.tenantId];
  const where = buildOpeningWhere(filters, params);

  const { rows } = await client.query(
    `WITH ${scopedCte(where)},
     timeline AS (
       SELECT h.application_id, h.to_stage AS stage, h.changed_at,
              LEAD(h.changed_at) OVER (PARTITION BY h.application_id ORDER BY h.seq) AS next_at
         FROM om_application_stage_history h
         JOIN apps ON apps.id = h.application_id
     )
     SELECT stage,
            COUNT(*)::text AS transitions,
            AVG(EXTRACT(EPOCH FROM (next_at - changed_at)) / 86400) AS avg_days
       FROM timeline
      WHERE next_at IS NOT NULL
      GROUP BY stage
      ORDER BY avg_days DESC NULLS LAST`,
    params
  );

  return rows.map((r: any) => ({
    stage: r.stage,
    transitions: Number(r.transitions),
    avgDays: Math.round(Number(r.avg_days) * 10) / 10,
  }));
}

// ─── Recruiter load ─────────────────────────────────────────────────────────

export async function recruiterLoad(
  client: TenantClient,
  filters: DashboardFilters
): Promise<RecruiterLoad[]> {
  const params: any[] = [client.tenantId];
  const where = buildOpeningWhere(filters, params);

  const { rows } = await client.query(
    `WITH ${scopedCte(where)}
     SELECT r.recruiter_id, u.name AS recruiter_name,
            COUNT(DISTINCT s.id)::text AS openings,
            COUNT(DISTINCT s.id) FILTER (
              WHERE s.status IN ('approved','internal_posting','external_posting','in_progress')
            )::text AS active_openings,
            COUNT(DISTINCT a.id)::text AS applications,
            COUNT(DISTINCT a.id) FILTER (WHERE a.stage = 'hired')::text AS joined
       FROM om_opening_recruiters r
       JOIN scoped s ON s.id = r.opening_id
       LEFT JOIN apps a ON a.opening_id = s.id
       LEFT JOIN users u ON u.id = r.recruiter_id
      WHERE r.tenant_id = $1
      GROUP BY r.recruiter_id, u.name
      ORDER BY COUNT(DISTINCT s.id) DESC`,
    params
  );

  return rows.map((r: any) => ({
    recruiterId: r.recruiter_id,
    recruiterName: r.recruiter_name,
    openings: Number(r.openings),
    activeOpenings: Number(r.active_openings),
    applications: Number(r.applications),
    joined: Number(r.joined),
  }));
}
