// src/modules/performance-report/repositories/generated.repo.ts
//
// Raw-SQL access for prr_generated_reports (the archived monthly PDFs). Only the
// scores + a small summary live here; the PDF itself is on R2 (file_url).

import { TenantClient } from '../db/pool';

export interface GeneratedReport {
  id: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  userPosition: string | null;
  userDepartment: string | null;
  userSubDepartment: string | null;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  overallScore: number | null;
  ticketsScore: number | null;
  timeTrackingScore: number | null;
  dailyUpdatesScore: number | null;
  attendanceScore: number | null;
  leavesScore: number | null;
  summary: Record<string, unknown>;
  fileUrl: string;
  status: string;
  generatedBy: string | null;
  generatedAt: Date;
}

export interface SaveGeneratedData {
  userId: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  overall: number | null;
  tickets: number | null;
  timeTracking: number | null;
  dailyUpdates: number | null;
  attendance: number | null;
  leaves: number | null;
  summary: Record<string, unknown>;
  fileUrl: string;
  fileKey: string;
  generatedBy: string;
}

const SELECT_COLS = `
  r.id, r.user_id, r.period_key, r.period_start, r.period_end,
  r.overall_score, r.tickets_score, r.time_tracking_score, r.daily_updates_score,
  r.attendance_score, r.leaves_score, r.summary, r.file_url, r.status,
  r.generated_by, r.generated_at,
  u.name AS user_name, u.avatar_url AS user_avatar,
  p.title AS user_position, d.name AS user_department, sd.name AS user_sub_department
`;

// Member join shared by list/findById (position → department / sub-department).
const MEMBER_JOINS = `
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN positions p ON p.id = u.position_id
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN sub_departments sd ON sd.id = p.sub_department_id
`;

function mapRow(row: any): GeneratedReport {
  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatar: row.user_avatar,
    userPosition: row.user_position,
    userDepartment: row.user_department,
    userSubDepartment: row.user_sub_department,
    periodKey: row.period_key,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    overallScore: num(row.overall_score),
    ticketsScore: num(row.tickets_score),
    timeTrackingScore: num(row.time_tracking_score),
    dailyUpdatesScore: num(row.daily_updates_score),
    attendanceScore: num(row.attendance_score),
    leavesScore: num(row.leaves_score),
    summary: row.summary ?? {},
    fileUrl: row.file_url,
    status: row.status,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at,
  };
}

/** Insert or replace the report for (tenant, user, period). */
export async function upsert(client: TenantClient, d: SaveGeneratedData): Promise<GeneratedReport> {
  const { rows } = await client.query(
    `INSERT INTO prr_generated_reports
       (tenant_id, user_id, period_key, period_start, period_end,
        overall_score, tickets_score, time_tracking_score, daily_updates_score,
        attendance_score, leaves_score, summary, file_url, file_key, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
     ON CONFLICT (tenant_id, user_id, period_key) DO UPDATE SET
       period_start = EXCLUDED.period_start,
       period_end   = EXCLUDED.period_end,
       overall_score = EXCLUDED.overall_score,
       tickets_score = EXCLUDED.tickets_score,
       time_tracking_score = EXCLUDED.time_tracking_score,
       daily_updates_score = EXCLUDED.daily_updates_score,
       attendance_score = EXCLUDED.attendance_score,
       leaves_score = EXCLUDED.leaves_score,
       summary = EXCLUDED.summary,
       file_url = EXCLUDED.file_url,
       file_key = EXCLUDED.file_key,
       generated_by = EXCLUDED.generated_by,
       generated_at = now()
     RETURNING id`,
    [
      client.tenantId,
      d.userId,
      d.periodKey,
      d.periodStart,
      d.periodEnd,
      d.overall,
      d.tickets,
      d.timeTracking,
      d.dailyUpdates,
      d.attendance,
      d.leaves,
      JSON.stringify(d.summary ?? {}),
      d.fileUrl,
      d.fileKey,
      d.generatedBy,
    ]
  );
  const found = await findById(client, rows[0].id);
  return found!;
}

export async function list(client: TenantClient, periodKey?: string): Promise<GeneratedReport[]> {
  const params: any[] = [client.tenantId];
  let sql = `SELECT ${SELECT_COLS}
               FROM prr_generated_reports r
               ${MEMBER_JOINS}
              WHERE r.tenant_id = $1`;
  if (periodKey) {
    params.push(periodKey);
    sql += ` AND r.period_key = $2`;
  }
  sql += ` ORDER BY r.period_key DESC, u.name ASC`;
  const { rows } = await client.query(sql, params);
  return rows.map(mapRow);
}

/** Reports belonging to one user (their own "My Reports" view). */
export async function listForUser(client: TenantClient, userId: string): Promise<GeneratedReport[]> {
  const { rows } = await client.query(
    `SELECT ${SELECT_COLS}
       FROM prr_generated_reports r
       ${MEMBER_JOINS}
      WHERE r.tenant_id = $1 AND r.user_id = $2
      ORDER BY r.period_key DESC`,
    [client.tenantId, userId]
  );
  return rows.map(mapRow);
}

export async function findById(client: TenantClient, id: string): Promise<GeneratedReport | null> {
  const { rows } = await client.query(
    `SELECT ${SELECT_COLS}
       FROM prr_generated_reports r
       ${MEMBER_JOINS}
      WHERE r.tenant_id = $1 AND r.id = $2`,
    [client.tenantId, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Distinct period keys that have reports (for the month filter). */
export async function listPeriods(client: TenantClient): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT DISTINCT period_key FROM prr_generated_reports
      WHERE tenant_id = $1 ORDER BY period_key DESC`,
    [client.tenantId]
  );
  return rows.map((r: any) => r.period_key);
}

export async function remove(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM prr_generated_reports WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id]
  );
  return rowCount > 0;
}
