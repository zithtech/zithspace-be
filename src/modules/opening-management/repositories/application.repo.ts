// src/modules/opening-management/repositories/application.repo.ts
//
// Raw-SQL data access for Phase 5: om_opening_applications and its stage
// history.
//
// Candidate details come from the platform's `candidates` table via LEFT JOIN —
// this module stores only the link, never a copy. Every projection is therefore
// nullable: the candidate row can be removed without a foreign key stopping it.

import { TenantClient } from '../db/pool';
import {
  ApplicationStage,
  ApplicationStageHistoryEntry,
  ApplicationFunnel,
  IntakeSource,
  OpeningApplication,
} from '../types';

function num(v: string | null): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapApplication(r: any): OpeningApplication {
  return {
    id: r.id,
    openingId: r.opening_id,
    candidateId: r.candidate_id ?? r.pipeline_candidate_id,
    candidateSource: r.pipeline_candidate_id ? 'pipeline' : 'ats',
    candidateName: r.candidate_name,
    candidateEmail: r.candidate_email,
    candidatePhone: r.candidate_phone,
    candidateCurrentRole: r.candidate_current_role,
    candidateExperience: num(r.candidate_experience),
    candidateSkills: r.candidate_skills ?? [],
    source: r.source,
    sourceDetail: r.source_detail,
    referredBy: r.referred_by,
    referredByName: r.referred_by_name,
    stage: r.stage,
    stageChangedAt: r.stage_changed_at,
    rejectionReason: r.rejection_reason,
    appliedAt: r.applied_at,
    resumeUrl: r.resume_url,
    notes: r.notes,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// An application points at ONE of two candidate stores (see 009). Both are
// joined and the display fields coalesced, so the rest of the module never has
// to care which one a candidate came from.
const APPLICATION_SELECT = `
  SELECT a.id, a.opening_id, a.candidate_id, a.pipeline_candidate_id,
         COALESCE(c.full_name, pc.name)                     AS candidate_name,
         COALESCE(c.email, pc.email)                        AS candidate_email,
         COALESCE(c.phone_number, pc.mobile)                AS candidate_phone,
         COALESCE(c.current_role, pc.role)                  AS candidate_current_role,
         COALESCE(c.years_of_experience, pc.total_experience) AS candidate_experience,
         COALESCE(c.primary_skills, '{}')                   AS candidate_skills,
         a.source, a.source_detail,
         a.referred_by, ref.name AS referred_by_name,
         a.stage, a.stage_changed_at, a.rejection_reason,
         a.applied_at, COALESCE(a.resume_url, pc.resume_url) AS resume_url, a.notes,
         a.created_by, a.updated_by, a.created_at, a.updated_at
    FROM om_opening_applications a
    LEFT JOIN candidates c           ON c.id = a.candidate_id
    LEFT JOIN pipeline_candidates pc ON pc.id = a.pipeline_candidate_id
    LEFT JOIN users ref              ON ref.id = a.referred_by
`;

// ─── Create ─────────────────────────────────────────────────────────────────

export interface CreateApplicationData {
  openingId: string;
  /** Exactly one of these is set — see the CHECK in 009. */
  candidateId: string | null;
  pipelineCandidateId: string | null;
  source: IntakeSource;
  sourceDetail: string | null;
  referredBy: string | null;
  resumeUrl: string | null;
  notes: string | null;
  stage: ApplicationStage;
  createdBy: string;
}

export async function insert(
  client: TenantClient,
  data: CreateApplicationData
): Promise<OpeningApplication> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO om_opening_applications
       (tenant_id, opening_id, candidate_id, pipeline_candidate_id, source,
        source_detail, referred_by, resume_url, notes, stage, created_by, updated_by)
     VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id`,
    [
      client.tenantId,
      data.openingId,
      data.candidateId,
      data.pipelineCandidateId,
      data.source,
      data.sourceDetail,
      data.referredBy,
      data.resumeUrl,
      data.notes,
      data.stage,
      data.createdBy,
    ]
  );
  const created = await findById(client, rows[0].id);
  if (!created) throw new Error('[opening-management] application vanished after insert');
  return created;
}

// ─── Read ───────────────────────────────────────────────────────────────────

export async function findById(
  client: TenantClient,
  id: string
): Promise<OpeningApplication | null> {
  const { rows } = await client.query(
    `${APPLICATION_SELECT}
      WHERE a.tenant_id = $1 AND a.id = $2 AND a.deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapApplication(rows[0]) : null;
}

export interface ApplicationFilters {
  stage?: ApplicationStage[];
  source?: IntakeSource[];
  /** Matches candidate name or email. */
  search?: string;
}

export async function findByOpening(
  client: TenantClient,
  openingId: string,
  filters: ApplicationFilters,
  opts: { limit: number; offset: number }
): Promise<OpeningApplication[]> {
  const params: any[] = [client.tenantId, openingId];
  const where = buildWhere(filters, params);

  params.push(opts.limit, opts.offset);
  const { rows } = await client.query(
    `${APPLICATION_SELECT}
      WHERE ${where}
      ORDER BY a.applied_at DESC, a.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map(mapApplication);
}

export async function countByOpening(
  client: TenantClient,
  openingId: string,
  filters: ApplicationFilters
): Promise<number> {
  const params: any[] = [client.tenantId, openingId];
  const where = buildWhere(filters, params);
  const { rows } = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
       FROM om_opening_applications a
       LEFT JOIN candidates c           ON c.id = a.candidate_id
       LEFT JOIN pipeline_candidates pc ON pc.id = a.pipeline_candidate_id
      WHERE ${where}`,
    params
  );
  return Number(rows[0].total);
}

/** $1 = tenant, $2 = opening; the caller seeds those before calling. */
function buildWhere(filters: ApplicationFilters, params: any[]): string {
  const conditions = ['a.tenant_id = $1', 'a.opening_id = $2', 'a.deleted_at IS NULL'];
  const push = (v: any): string => {
    params.push(v);
    return `$${params.length}`;
  };

  if (filters.stage?.length) conditions.push(`a.stage = ANY(${push(filters.stage)})`);
  if (filters.source?.length) conditions.push(`a.source = ANY(${push(filters.source)})`);
  if (filters.search) {
    const p = push(`%${filters.search}%`);
    conditions.push(
      `(c.full_name ILIKE ${p} OR c.email ILIKE ${p} OR pc.name ILIKE ${p} OR pc.email ILIKE ${p})`
    );
  }
  return conditions.join(' AND ');
}

/** Is this candidate already on this opening? Powers the duplicate check. */
export async function findByCandidate(
  client: TenantClient,
  openingId: string,
  candidateId: string,
  source: 'ats' | 'pipeline' = 'ats'
): Promise<OpeningApplication | null> {
  const predicate =
    source === 'pipeline' ? 'a.pipeline_candidate_id = $3::uuid' : 'a.candidate_id = $3';
  const { rows } = await client.query(
    `${APPLICATION_SELECT}
      WHERE a.tenant_id = $1 AND a.opening_id = $2 AND ${predicate}
        AND a.deleted_at IS NULL`,
    [client.tenantId, openingId, candidateId]
  );
  return rows[0] ? mapApplication(rows[0]) : null;
}

/** Every opening this candidate is in the pipeline for — the duplicate-effort view. */
export async function findOpeningsForCandidate(
  client: TenantClient,
  candidateId: string
): Promise<{ openingId: string; openingCode: string; jobTitle: string; stage: string }[]> {
  const { rows } = await client.query(
    `SELECT a.opening_id, o.opening_code, o.job_title, a.stage
       FROM om_opening_applications a
       JOIN om_openings o ON o.id = a.opening_id AND o.deleted_at IS NULL
      WHERE a.tenant_id = $1 AND a.candidate_id = $2 AND a.deleted_at IS NULL
      ORDER BY a.applied_at DESC`,
    [client.tenantId, candidateId]
  );
  return rows.map((r) => ({
    openingId: r.opening_id,
    openingCode: r.opening_code,
    jobTitle: r.job_title,
    stage: r.stage,
  }));
}

// ─── Update ─────────────────────────────────────────────────────────────────

export interface UpdateApplicationData {
  sourceDetail?: string | null;
  referredBy?: string | null;
  resumeUrl?: string | null;
  notes?: string | null;
  updatedBy: string;
}

const COLUMN_MAP: Record<string, string> = {
  sourceDetail: 'source_detail',
  referredBy: 'referred_by',
  resumeUrl: 'resume_url',
  notes: 'notes',
};

export async function update(
  client: TenantClient,
  id: string,
  data: UpdateApplicationData
): Promise<OpeningApplication | null> {
  const sets: string[] = [];
  const params: any[] = [client.tenantId, id];

  for (const [key, column] of Object.entries(COLUMN_MAP)) {
    if (key in data && (data as any)[key] !== undefined) {
      params.push((data as any)[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  params.push(data.updatedBy);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');

  const { rowCount } = await client.query(
    `UPDATE om_opening_applications
        SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    params
  );
  return (rowCount ?? 0) > 0 ? findById(client, id) : null;
}

/**
 * Move an application to a new stage.
 *
 * `stage = $4` guards the move: two recruiters acting at once means the second
 * affects no rows and gets a clean conflict instead of clobbering the first.
 */
export async function changeStage(
  client: TenantClient,
  id: string,
  fromStage: ApplicationStage,
  toStage: ApplicationStage,
  data: { rejectionReason: string | null; updatedBy: string }
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE om_opening_applications
        SET stage = $4,
            stage_changed_at = now(),
            rejection_reason = $5,
            updated_by = $6,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND stage = $3`,
    [client.tenantId, id, fromStage, toStage, data.rejectionReason, data.updatedBy]
  );
  return (rowCount ?? 0) > 0;
}

export async function softDelete(
  client: TenantClient,
  id: string,
  deletedBy: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE om_opening_applications
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, deletedBy]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Stage history ──────────────────────────────────────────────────────────

export async function appendStageHistory(
  client: TenantClient,
  data: {
    applicationId: string;
    fromStage: ApplicationStage | null;
    toStage: ApplicationStage;
    note: string | null;
    changedBy: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO om_application_stage_history
       (tenant_id, application_id, from_stage, to_stage, note, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      client.tenantId,
      data.applicationId,
      data.fromStage,
      data.toStage,
      data.note,
      data.changedBy,
    ]
  );
}

export async function findStageHistory(
  client: TenantClient,
  applicationId: string
): Promise<ApplicationStageHistoryEntry[]> {
  const { rows } = await client.query(
    `SELECT h.id, h.application_id, h.from_stage, h.to_stage, h.note,
            h.changed_by, u.name AS changed_by_name, h.changed_at
       FROM om_application_stage_history h
       LEFT JOIN users u ON u.id = h.changed_by::text
      WHERE h.tenant_id = $1 AND h.application_id = $2
      ORDER BY h.seq DESC`,
    [client.tenantId, applicationId]
  );
  return rows.map((r) => ({
    id: r.id,
    applicationId: r.application_id,
    fromStage: r.from_stage,
    toStage: r.to_stage,
    note: r.note,
    changedBy: r.changed_by,
    changedByName: r.changed_by_name ?? null,
    changedAt: r.changed_at,
  }));
}

// ─── Funnel ─────────────────────────────────────────────────────────────────

/**
 * Counts for one opening's funnel.
 *
 * "Screened", "Interview" and "Offers" are FURTHEST-REACHED counts, not live
 * ones: somebody who has an offer was screened and interviewed on the way, and a
 * dashboard that showed them only under "Offers" would make the earlier stages
 * look like they never happened. The stage history is what makes that knowable —
 * a live `stage` column alone cannot answer it.
 */
export async function funnelForOpening(
  client: TenantClient,
  openingId: string
): Promise<Omit<ApplicationFunnel, 'openPositions'>> {
  const { rows } = await client.query<{
    applications: string;
    screened: string;
    interview: string;
    offers: string;
    joined: string;
    rejected: string;
    withdrawn: string;
  }>(
    `WITH apps AS (
       SELECT a.id, a.stage
         FROM om_opening_applications a
        WHERE a.tenant_id = $1 AND a.opening_id = $2 AND a.deleted_at IS NULL
     ),
     reached AS (
       -- Every stage each application has ever been in, current stage included.
       SELECT apps.id, apps.stage AS stage FROM apps
       UNION
       SELECT h.application_id, h.to_stage
         FROM om_application_stage_history h
         JOIN apps ON apps.id = h.application_id
        WHERE h.tenant_id = $1
     )
     SELECT
       (SELECT COUNT(*)::text FROM apps) AS applications,
       (SELECT COUNT(DISTINCT id)::text FROM reached
         WHERE stage IN ('screening','shortlisted','interview','offer','hired')) AS screened,
       (SELECT COUNT(DISTINCT id)::text FROM reached
         WHERE stage IN ('interview','offer','hired')) AS interview,
       (SELECT COUNT(DISTINCT id)::text FROM reached
         WHERE stage IN ('offer','hired')) AS offers,
       (SELECT COUNT(*)::text FROM apps WHERE stage = 'hired') AS joined,
       (SELECT COUNT(*)::text FROM apps WHERE stage = 'rejected') AS rejected,
       (SELECT COUNT(*)::text FROM apps WHERE stage = 'withdrawn') AS withdrawn`,
    [client.tenantId, openingId]
  );

  const byStage = await countBy(client, openingId, 'stage');
  const bySource = await countBy(client, openingId, 'source');

  const r = rows[0];
  return {
    applications: Number(r.applications),
    screened: Number(r.screened),
    interview: Number(r.interview),
    offers: Number(r.offers),
    joined: Number(r.joined),
    rejected: Number(r.rejected),
    withdrawn: Number(r.withdrawn),
    byStage,
    bySource,
  };
}

/** `column` is a fixed internal literal — never caller-supplied. */
async function countBy(
  client: TenantClient,
  openingId: string,
  column: 'stage' | 'source'
): Promise<Record<string, number>> {
  const { rows } = await client.query<{ key: string; total: string }>(
    `SELECT ${column} AS key, COUNT(*)::text AS total
       FROM om_opening_applications
      WHERE tenant_id = $1 AND opening_id = $2 AND deleted_at IS NULL
      GROUP BY ${column}`,
    [client.tenantId, openingId]
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = Number(r.total);
  return out;
}

/** Candidates still in play: not hired, rejected or withdrawn. */
export async function countOpen(
  client: TenantClient,
  openingId: string
): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM om_opening_applications
      WHERE tenant_id = $1 AND opening_id = $2 AND deleted_at IS NULL
        AND stage NOT IN ('hired', 'rejected', 'withdrawn')`,
    [client.tenantId, openingId]
  );
  return Number(rows[0].total);
}

/**
 * Reject everyone still in the pipeline — used when an opening closes and the
 * caller opts in to clearing it out.
 *
 * One statement. The `targets` CTE captures each application's CURRENT stage
 * before the update overwrites it, so the history rows record what people were
 * actually moved from; a plain `UPDATE … RETURNING` would only ever return
 * 'rejected'. Data-modifying CTEs are guaranteed to run to completion even
 * though the outer query does not read `upd`.
 */
export async function rejectAllOpen(
  client: TenantClient,
  openingId: string,
  reason: string,
  actorId: string
): Promise<number> {
  const { rowCount } = await client.query(
    `WITH targets AS (
       SELECT id, stage AS from_stage
         FROM om_opening_applications
        WHERE tenant_id = $1 AND opening_id = $2 AND deleted_at IS NULL
          AND stage NOT IN ('hired', 'rejected', 'withdrawn')
     ),
     upd AS (
       UPDATE om_opening_applications a
          SET stage = 'rejected', stage_changed_at = now(), rejection_reason = $3,
              updated_by = $4, updated_at = now()
         FROM targets t
        WHERE a.id = t.id
       RETURNING a.id
     )
     INSERT INTO om_application_stage_history
       (tenant_id, application_id, from_stage, to_stage, note, changed_by)
     SELECT $1, t.id, t.from_stage, 'rejected', $3, $4 FROM targets t`,
    [client.tenantId, openingId, reason, actorId]
  );
  return rowCount ?? 0;
}

export async function countHired(
  client: TenantClient,
  openingId: string
): Promise<number> {
  const { rows } = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM om_opening_applications
      WHERE tenant_id = $1 AND opening_id = $2 AND stage = 'hired' AND deleted_at IS NULL`,
    [client.tenantId, openingId]
  );
  return Number(rows[0].total);
}
