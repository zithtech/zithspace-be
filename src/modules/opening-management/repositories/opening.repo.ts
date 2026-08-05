// src/modules/opening-management/repositories/opening.repo.ts
//
// Raw-SQL data access for om_openings. This layer ONLY builds parameterized
// queries and maps rows — no business rules, no HTTP concerns.
//
// Every query takes a TenantClient (already scoped via withTenant) AND filters
// `tenant_id = $1` explicitly. RLS would enforce this anyway; the explicit
// filter is the second, independent guard against cross-tenant access.
//
// Display names (department, project, client, …) come from Prisma-owned tables
// via LEFT JOIN. They are read-only here and always nullable — this module owns
// no foreign keys into the Prisma schema.

import { TenantClient } from '../db/pool';
import {
  ClosureReason,
  EmploymentType,
  HiringType,
  Opening,
  OpeningPriority,
  OpeningStatus,
  OpeningVisibility,
  OpeningWithRefs,
  SalaryPeriod,
  WorkMode,
} from '../types';

interface OpeningRow {
  id: string;
  tenant_id: string;
  opening_code: string;
  client_id: string | null;
  project_id: string | null;
  department_id: string | null;
  sub_department_id: string | null;
  hiring_manager_id: string | null;
  employment_type_id: string | null;
  employment_type: EmploymentType;
  work_mode: WorkMode;
  location_id: string | null;
  location: string | null;
  number_of_positions: number;
  job_title: string;
  job_description: string | null;
  responsibilities: string | null;
  required_skills: string[];
  preferred_skills: string[];
  min_experience: string | null;
  max_experience: string | null;
  education: string | null;
  certifications: string[];
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string;
  salary_period: SalaryPeriod;
  budget: string | null;
  notice_period_days: number | null;
  shift_timing: string | null;
  joining_timeline: string | null;
  target_joining_date: string | null;
  priority: OpeningPriority;
  hiring_type: HiringType | null;
  visibility: OpeningVisibility;
  status: OpeningStatus;
  closure_reason: ClosureReason | null;
  closure_note: string | null;
  closed_by: string | null;
  duplicate_of_opening_id: string | null;
  is_archived: boolean;
  archived_at: Date | null;
  archived_by: string | null;
  status_reason: string | null;
  status_note: string | null;
  status_changed_at: Date | null;
  closed_at: Date | null;
  approval_round: number;
  submitted_at: Date | null;
  submitted_by: string | null;
  approved_at: Date | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface OpeningRefsRow extends OpeningRow {
  client_name: string | null;
  project_name: string | null;
  department_name: string | null;
  sub_department_name: string | null;
  hiring_manager_name: string | null;
  employment_type_name: string | null;
}

/** pg returns numeric columns as strings — convert once, here. */
function num(v: string | null): number | null {
  return v === null ? null : Number(v);
}

function mapRow(row: OpeningRow): Opening {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    openingCode: row.opening_code,
    clientId: row.client_id,
    projectId: row.project_id,
    departmentId: row.department_id,
    subDepartmentId: row.sub_department_id,
    hiringManagerId: row.hiring_manager_id,
    employmentTypeId: row.employment_type_id,
    employmentType: row.employment_type,
    workMode: row.work_mode,
    locationId: row.location_id,
    location: row.location,
    numberOfPositions: row.number_of_positions,
    jobTitle: row.job_title,
    jobDescription: row.job_description,
    responsibilities: row.responsibilities,
    requiredSkills: row.required_skills ?? [],
    preferredSkills: row.preferred_skills ?? [],
    minExperience: num(row.min_experience),
    maxExperience: num(row.max_experience),
    education: row.education,
    certifications: row.certifications ?? [],
    salaryMin: num(row.salary_min),
    salaryMax: num(row.salary_max),
    salaryCurrency: row.salary_currency,
    salaryPeriod: row.salary_period,
    budget: num(row.budget),
    noticePeriodDays: row.notice_period_days,
    shiftTiming: row.shift_timing,
    joiningTimeline: row.joining_timeline,
    targetJoiningDate: row.target_joining_date,
    priority: row.priority,
    hiringType: row.hiring_type,
    visibility: row.visibility,
    status: row.status,
    closureReason: row.closure_reason,
    closureNote: row.closure_note,
    closedBy: row.closed_by,
    duplicateOfOpeningId: row.duplicate_of_opening_id,
    isArchived: row.is_archived,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
    statusReason: row.status_reason,
    statusNote: row.status_note,
    statusChangedAt: row.status_changed_at,
    closedAt: row.closed_at,
    approvalRound: row.approval_round,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
    approvedAt: row.approved_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRefsRow(row: OpeningRefsRow): OpeningWithRefs {
  return {
    ...mapRow(row),
    clientName: row.client_name,
    projectName: row.project_name,
    departmentName: row.department_name,
    subDepartmentName: row.sub_department_name,
    hiringManagerName: row.hiring_manager_name,
    employmentTypeName: row.employment_type_name,
  };
}

/**
 * The full column list, optionally table-qualified. SELECTs join other tables so
 * they need the `o.` prefix; INSERT/UPDATE … RETURNING must not have one.
 *
 * `target_joining_date` is rendered as text: a `date` would come back as a JS
 * Date in the server's timezone, which can shift the calendar day.
 */
function openingCols(prefix: 'o' | ''): string {
  const p = prefix ? `${prefix}.` : '';
  return `
    ${p}id, ${p}tenant_id, ${p}opening_code,
    ${p}client_id, ${p}project_id, ${p}department_id, ${p}sub_department_id,
    ${p}hiring_manager_id, ${p}employment_type_id, ${p}employment_type, ${p}work_mode,
    ${p}location_id, ${p}location, ${p}number_of_positions,
    ${p}job_title, ${p}job_description, ${p}responsibilities,
    ${p}required_skills, ${p}preferred_skills,
    ${p}min_experience, ${p}max_experience, ${p}education, ${p}certifications,
    ${p}salary_min, ${p}salary_max, ${p}salary_currency, ${p}salary_period, ${p}budget,
    ${p}notice_period_days, ${p}shift_timing, ${p}joining_timeline,
    to_char(${p}target_joining_date, 'YYYY-MM-DD') AS target_joining_date,
    ${p}priority, ${p}hiring_type, ${p}visibility, ${p}status,
    ${p}status_reason, ${p}status_note, ${p}status_changed_at, ${p}closed_at,
    ${p}closure_reason, ${p}closure_note, ${p}closed_by, ${p}duplicate_of_opening_id,
    ${p}is_archived, ${p}archived_at, ${p}archived_by,
    ${p}approval_round, ${p}submitted_at, ${p}submitted_by, ${p}approved_at,
    ${p}created_by, ${p}updated_by, ${p}created_at, ${p}updated_at
  `;
}

const BASE_COLS = openingCols('o');
const RETURNING_COLS = openingCols('');

const REF_COLS = `
  COALESCE(rc.client_name, cv.company_name) AS client_name,
  p.name  AS project_name,
  d.name  AS department_name,
  sd.name AS sub_department_name,
  hm.name AS hiring_manager_name,
  et.name AS employment_type_name
`;

// Master-data lookups live in Prisma-owned tables. A client id may point at
// either the recruitment client master or clients_v2, so both are joined and
// coalesced above.
const REF_JOINS = `
  LEFT JOIN recruitment_client_basic_information rc ON rc.id = o.client_id
  LEFT JOIN clients_v2 cv ON cv.id = o.client_id
  LEFT JOIN projects p    ON p.id  = o.project_id
  LEFT JOIN departments d ON d.id  = o.department_id
  LEFT JOIN sub_departments sd ON sd.id = o.sub_department_id
  LEFT JOIN users hm ON hm.id = o.hiring_manager_id
  LEFT JOIN employment_types et ON et.id = o.employment_type_id
`;

// ─── Create ─────────────────────────────────────────────────────────────────

export interface CreateOpeningData {
  openingCode: string;
  clientId: string | null;
  projectId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  hiringManagerId: string | null;
  employmentTypeId: string | null;
  employmentType: EmploymentType;
  workMode: WorkMode;
  locationId: string | null;
  location: string | null;
  numberOfPositions: number;
  jobTitle: string;
  jobDescription: string | null;
  responsibilities: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  minExperience: number | null;
  maxExperience: number | null;
  education: string | null;
  certifications: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  budget: number | null;
  noticePeriodDays: number | null;
  shiftTiming: string | null;
  joiningTimeline: string | null;
  targetJoiningDate: string | null;
  priority: OpeningPriority;
  hiringType: HiringType | null;
  visibility: OpeningVisibility;
  createdBy: string;
}

export async function insert(client: TenantClient, data: CreateOpeningData): Promise<Opening> {
  const { rows } = await client.query<OpeningRow>(
    `INSERT INTO om_openings (
       tenant_id, opening_code,
       client_id, project_id, department_id, sub_department_id,
       hiring_manager_id, employment_type_id, employment_type, work_mode,
       location_id, location, number_of_positions,
       job_title, job_description, responsibilities,
       required_skills, preferred_skills,
       min_experience, max_experience, education, certifications,
       salary_min, salary_max, salary_currency, salary_period, budget,
       notice_period_days, shift_timing, joining_timeline, target_joining_date,
       priority, hiring_type, visibility, status,
       created_by, updated_by
     ) VALUES (
       $1, $2,
       $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13,
       $14, $15, $16,
       $17, $18,
       $19, $20, $21, $22,
       $23, $24, $25, $26, $27,
       $28, $29, $30, $31,
       $32, $33, $34, 'draft',
       $35, $35
     )
     RETURNING ${RETURNING_COLS}`,
    [
      client.tenantId,
      data.openingCode,
      data.clientId,
      data.projectId,
      data.departmentId,
      data.subDepartmentId,
      data.hiringManagerId,
      data.employmentTypeId,
      data.employmentType,
      data.workMode,
      data.locationId,
      data.location,
      data.numberOfPositions,
      data.jobTitle,
      data.jobDescription,
      data.responsibilities,
      data.requiredSkills,
      data.preferredSkills,
      data.minExperience,
      data.maxExperience,
      data.education,
      data.certifications,
      data.salaryMin,
      data.salaryMax,
      data.salaryCurrency,
      data.salaryPeriod,
      data.budget,
      data.noticePeriodDays,
      data.shiftTiming,
      data.joiningTimeline,
      data.targetJoiningDate,
      data.priority,
      data.hiringType,
      data.visibility,
      data.createdBy,
    ]
  );
  return mapRow(rows[0]);
}

/**
 * Next per-tenant opening code (OPN-00001, OPN-00002, …).
 *
 * Derived from the highest existing numeric suffix rather than a sequence so
 * each tenant gets its own dense series. Two concurrent creates can compute the
 * same code; `uq_om_openings_tenant_code` rejects the loser and the service
 * retries.
 */
export async function nextOpeningCode(client: TenantClient): Promise<string> {
  const { rows } = await client.query<{ next_seq: string }>(
    `SELECT COALESCE(MAX(substring(opening_code from '[0-9]+$')::bigint), 0) + 1 AS next_seq
       FROM om_openings
      WHERE tenant_id = $1 AND opening_code ~ '^OPN-[0-9]+$'`,
    [client.tenantId]
  );
  return `OPN-${String(rows[0].next_seq).padStart(5, '0')}`;
}

// ─── Read ───────────────────────────────────────────────────────────────────

export interface ListFilters {
  search?: string;
  status?: OpeningStatus[];
  priority?: OpeningPriority[];
  employmentType?: EmploymentType[];
  workMode?: WorkMode[];
  visibility?: OpeningVisibility;
  hiringType?: HiringType;
  clientId?: string;
  projectId?: string;
  departmentId?: string;
  subDepartmentId?: string;
  hiringManagerId?: string;
  recruiterId?: string;
  recruiters?: string[];
  experience?: string[];
  jobTitles?: string[];
  /**
   * Archived openings are finished work. 'exclude' (the default) keeps them out
   * of the working list, 'only' is the archive view.
   */
  archived?: 'exclude' | 'include' | 'only';
}

const SORT_COLUMNS: Record<string, string> = {
  createdAt: 'o.created_at',
  updatedAt: 'o.updated_at',
  jobTitle: 'o.job_title',
  numberOfPositions: 'o.number_of_positions',
  openingCode: 'o.opening_code',
  // Ordered by urgency, not alphabetically.
  priority: `CASE o.priority
               WHEN 'critical' THEN 4
               WHEN 'high' THEN 3
               WHEN 'medium' THEN 2
               ELSE 1
             END`,
};

/**
 * Build the shared WHERE clause. `params` is mutated: the caller seeds it with
 * the tenant id at $1 and receives back the full ordered parameter list.
 */
function buildWhere(filters: ListFilters, params: any[]): string {
  const conditions = ['o.tenant_id = $1', 'o.deleted_at IS NULL'];

  const archived = filters.archived ?? 'exclude';
  if (archived === 'exclude') conditions.push('NOT o.is_archived');
  else if (archived === 'only') conditions.push('o.is_archived');

  const push = (value: any): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.search) {
    const p = push(`%${filters.search}%`);
    conditions.push(
      `(o.job_title ILIKE ${p} OR o.opening_code ILIKE ${p} OR o.location ILIKE ${p})`
    );
  }
  if (filters.status?.length) conditions.push(`o.status = ANY(${push(filters.status)})`);
  if (filters.priority?.length) conditions.push(`o.priority = ANY(${push(filters.priority)})`);
  if (filters.employmentType?.length)
    conditions.push(`o.employment_type = ANY(${push(filters.employmentType)})`);
  if (filters.workMode?.length) conditions.push(`o.work_mode = ANY(${push(filters.workMode)})`);
  if (filters.visibility) conditions.push(`o.visibility = ${push(filters.visibility)}`);
  if (filters.hiringType) conditions.push(`o.hiring_type = ${push(filters.hiringType)}`);
  if (filters.clientId) conditions.push(`o.client_id = ${push(filters.clientId)}`);
  if (filters.projectId) conditions.push(`o.project_id = ${push(filters.projectId)}`);
  if (filters.departmentId) conditions.push(`o.department_id = ${push(filters.departmentId)}`);
  if (filters.subDepartmentId)
    conditions.push(`o.sub_department_id = ${push(filters.subDepartmentId)}`);
  if (filters.hiringManagerId)
    conditions.push(`o.hiring_manager_id = ${push(filters.hiringManagerId)}`);
  if (filters.recruiterId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM om_opening_recruiters r
                WHERE r.opening_id = o.id AND r.recruiter_id = ${push(filters.recruiterId)})`
    );
  }
  if (filters.recruiters?.length) {
    conditions.push(
      `EXISTS (SELECT 1 FROM om_opening_recruiters r
                WHERE r.opening_id = o.id AND r.recruiter_id = ANY(${push(filters.recruiters)}))`
    );
  }
  if (filters.jobTitles?.length) {
    conditions.push(`o.job_title = ANY(${push(filters.jobTitles)})`);
  }
  if (filters.experience?.length) {
    const expConds = filters.experience.map(exp => {
      if (exp === '0-2') return `(o.min_experience <= 2 OR o.min_experience IS NULL)`;
      if (exp === '3-5') return `(o.min_experience >= 3 AND o.min_experience <= 5)`;
      if (exp === '5+') return `(o.min_experience >= 5)`;
      return null;
    }).filter(Boolean);
    if (expConds.length > 0) {
      conditions.push(`(${expConds.join(' OR ')})`);
    }
  }

  return conditions.join(' AND ');
}

export async function findAll(
  client: TenantClient,
  filters: ListFilters,
  opts: { limit: number; offset: number; sortBy: string; sortOrder: 'asc' | 'desc' }
): Promise<OpeningWithRefs[]> {
  const params: any[] = [client.tenantId];
  const where = buildWhere(filters, params);
  const sortCol = SORT_COLUMNS[opts.sortBy] ?? SORT_COLUMNS.createdAt;
  const direction = opts.sortOrder === 'asc' ? 'ASC' : 'DESC';

  params.push(opts.limit, opts.offset);

  const { rows } = await client.query<OpeningRefsRow>(
    `SELECT ${BASE_COLS}, ${REF_COLS}
       FROM om_openings o
       ${REF_JOINS}
      WHERE ${where}
      ORDER BY ${sortCol} ${direction}, o.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map(mapRefsRow);
}

export async function countAll(client: TenantClient, filters: ListFilters): Promise<number> {
  const params: any[] = [client.tenantId];
  const where = buildWhere(filters, params);
  const { rows } = await client.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM om_openings o WHERE ${where}`,
    params
  );
  return Number(rows[0].total);
}

export async function findById(
  client: TenantClient,
  id: string
): Promise<OpeningWithRefs | null> {
  const { rows } = await client.query<OpeningRefsRow>(
    `SELECT ${BASE_COLS}, ${REF_COLS}
       FROM om_openings o
       ${REF_JOINS}
      WHERE o.tenant_id = $1 AND o.id = $2 AND o.deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRefsRow(rows[0]) : null;
}

// ─── Update ─────────────────────────────────────────────────────────────────

export interface UpdateOpeningData {
  clientId?: string | null;
  projectId?: string | null;
  departmentId?: string | null;
  subDepartmentId?: string | null;
  hiringManagerId?: string | null;
  employmentTypeId?: string | null;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  locationId?: string | null;
  location?: string | null;
  numberOfPositions?: number;
  jobTitle?: string;
  jobDescription?: string | null;
  responsibilities?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  minExperience?: number | null;
  maxExperience?: number | null;
  education?: string | null;
  certifications?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  salaryPeriod?: SalaryPeriod;
  budget?: number | null;
  noticePeriodDays?: number | null;
  shiftTiming?: string | null;
  joiningTimeline?: string | null;
  targetJoiningDate?: string | null;
  priority?: OpeningPriority;
  hiringType?: HiringType | null;
  visibility?: OpeningVisibility;
  updatedBy: string;
}

const COLUMN_MAP: Record<string, string> = {
  clientId: 'client_id',
  projectId: 'project_id',
  departmentId: 'department_id',
  subDepartmentId: 'sub_department_id',
  hiringManagerId: 'hiring_manager_id',
  employmentTypeId: 'employment_type_id',
  employmentType: 'employment_type',
  workMode: 'work_mode',
  locationId: 'location_id',
  location: 'location',
  numberOfPositions: 'number_of_positions',
  jobTitle: 'job_title',
  jobDescription: 'job_description',
  responsibilities: 'responsibilities',
  requiredSkills: 'required_skills',
  preferredSkills: 'preferred_skills',
  minExperience: 'min_experience',
  maxExperience: 'max_experience',
  education: 'education',
  certifications: 'certifications',
  salaryMin: 'salary_min',
  salaryMax: 'salary_max',
  salaryCurrency: 'salary_currency',
  salaryPeriod: 'salary_period',
  budget: 'budget',
  noticePeriodDays: 'notice_period_days',
  shiftTiming: 'shift_timing',
  joiningTimeline: 'joining_timeline',
  targetJoiningDate: 'target_joining_date',
  priority: 'priority',
  hiringType: 'hiring_type',
  visibility: 'visibility',
};

/** Dynamic partial update. Returns the updated row, or null if not found. */
export async function update(
  client: TenantClient,
  id: string,
  data: UpdateOpeningData
): Promise<Opening | null> {
  const sets: string[] = [];
  const params: any[] = [client.tenantId, id];

  for (const [key, column] of Object.entries(COLUMN_MAP)) {
    if (key in data && (data as any)[key] !== undefined) {
      params.push((data as any)[key]);
      // target_joining_date arrives as a 'YYYY-MM-DD' string; cast so a NULL
      // parameter still resolves to the date type.
      const cast = column === 'target_joining_date' ? '::date' : '';
      sets.push(`${column} = $${params.length}${cast}`);
    }
  }

  params.push(data.updatedBy);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');

  const { rows } = await client.query<OpeningRow>(
    `UPDATE om_openings
        SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${RETURNING_COLS}`,
    params
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// ─── Approval state transitions (Phase 2) ───────────────────────────────────
// Each of these is a guarded compare-and-set: the WHERE clause names the status
// the opening must currently be in, so a concurrent transition affects 0 rows
// and the service reports a conflict instead of corrupting the lifecycle.

/**
 * draft → pending_approval, opening the given round.
 * Returns null when the opening was not in 'draft' any more.
 */
export async function markSubmitted(
  client: TenantClient,
  id: string,
  round: number,
  submittedBy: string
): Promise<Opening | null> {
  const { rows } = await client.query<OpeningRow>(
    `UPDATE om_openings
        SET status = 'pending_approval',
            approval_round = $3,
            submitted_at = now(),
            submitted_by = $4,
            approved_at = NULL,
            updated_by = $4,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND status = 'draft'
      RETURNING ${RETURNING_COLS}`,
    [client.tenantId, id, round, submittedBy]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** pending_approval → approved (every step of the round decided favourably). */
export async function markApproved(
  client: TenantClient,
  id: string,
  updatedBy: string
): Promise<Opening | null> {
  const { rows } = await client.query<OpeningRow>(
    `UPDATE om_openings
        SET status = 'approved', approved_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND status = 'pending_approval'
      RETURNING ${RETURNING_COLS}`,
    [client.tenantId, id, updatedBy]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * pending_approval → draft, after a rejection or a withdrawal. The round number
 * is kept so the next submission increments past it and history stays readable.
 */
export async function markReturnedToDraft(
  client: TenantClient,
  id: string,
  updatedBy: string
): Promise<Opening | null> {
  const { rows } = await client.query<OpeningRow>(
    `UPDATE om_openings
        SET status = 'draft', submitted_at = NULL, submitted_by = NULL,
            approved_at = NULL, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND status = 'pending_approval'
      RETURNING ${RETURNING_COLS}`,
    [client.tenantId, id, updatedBy]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// ─── Closure + archive (Phase 7) ────────────────────────────────────────────

export interface ClosureData {
  closureReason: ClosureReason;
  closureNote: string | null;
  duplicateOfOpeningId: string | null;
  archive: boolean;
  closedBy: string;
}

/**
 * Stamp the closure fields. The status transition itself is done separately by
 * the Phase 3 state machine — this only records WHY and archives.
 *
 * Guarded on the row still being un-closed so a double submit cannot overwrite
 * the first closure's reason with a second one.
 */
export async function recordClosure(
  client: TenantClient,
  id: string,
  data: ClosureData
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE om_openings
        SET closure_reason = $3,
            closure_note = $4,
            duplicate_of_opening_id = $5,
            closed_by = $6,
            is_archived = $7::boolean,
            archived_at = CASE WHEN $7::boolean THEN now() ELSE NULL END,
            archived_by = CASE WHEN $7::boolean THEN $6::uuid ELSE NULL END,
            updated_by = $6,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND closure_reason IS NULL`,
    [
      client.tenantId,
      id,
      data.closureReason,
      data.closureNote,
      data.duplicateOfOpeningId,
      data.closedBy,
      data.archive,
    ]
  );
  return (rowCount ?? 0) > 0;
}

/** Archive an already-closed opening that was not archived at the time. */
export async function setArchived(
  client: TenantClient,
  id: string,
  archived: boolean,
  actorId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE om_openings
        SET is_archived = $3::boolean,
            archived_at = CASE WHEN $3::boolean THEN now() ELSE NULL END,
            archived_by = CASE WHEN $3::boolean THEN $4::uuid ELSE NULL END,
            updated_by = $4,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL AND is_archived <> $3::boolean`,
    [client.tenantId, id, archived, actorId]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Openings that have hit their hiring target but are still open — the
 * "ready to close" queue.
 *
 * One statement, not one query per opening: the hire count is a correlated
 * aggregate, and the whole point is to scan every live opening cheaply.
 */
export async function findClosureCandidates(
  client: TenantClient
): Promise<
  {
    openingId: string;
    openingCode: string;
    jobTitle: string;
    status: OpeningStatus;
    openPositions: number;
    hired: number;
    openApplications: number;
    departmentName: string | null;
    hiringManagerName: string | null;
  }[]
> {
  const { rows } = await client.query(
    `WITH counts AS (
       SELECT a.opening_id,
              COUNT(*) FILTER (WHERE a.stage = 'hired') AS hired,
              COUNT(*) FILTER (
                WHERE a.stage NOT IN ('hired', 'rejected', 'withdrawn')
              ) AS open_applications
         FROM om_opening_applications a
        WHERE a.tenant_id = $1 AND a.deleted_at IS NULL
        GROUP BY a.opening_id
     )
     SELECT o.id AS opening_id, o.opening_code, o.job_title, o.status,
            o.number_of_positions, counts.hired, counts.open_applications,
            d.name AS department_name, hm.name AS hiring_manager_name
       FROM om_openings o
       JOIN counts ON counts.opening_id = o.id
       LEFT JOIN departments d ON d.id = o.department_id
       LEFT JOIN users hm ON hm.id = o.hiring_manager_id
      WHERE o.tenant_id = $1
        AND o.deleted_at IS NULL
        AND o.closure_reason IS NULL
        AND o.status NOT IN ('cancelled', 'closed', 'draft', 'pending_approval')
        AND counts.hired >= o.number_of_positions
      ORDER BY counts.hired DESC, o.created_at ASC`,
    [client.tenantId]
  );

  return rows.map((r: any) => ({
    openingId: r.opening_id,
    openingCode: r.opening_code,
    jobTitle: r.job_title,
    status: r.status,
    openPositions: Number(r.number_of_positions),
    hired: Number(r.hired),
    openApplications: Number(r.open_applications),
    departmentName: r.department_name,
    hiringManagerName: r.hiring_manager_name,
  }));
}

/** Soft delete. Returns true if a row was affected. */
export async function softDelete(
  client: TenantClient,
  id: string,
  deletedBy: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE om_openings
        SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, deletedBy]
  );
  return (rowCount ?? 0) > 0;
}
