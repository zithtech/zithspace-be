// src/modules/performance-report/repositories/reports.repo.ts
//
// Raw-SQL data access for the in-month performance report. The first slice is
// TICKETS: which tickets a member actually WORKED (logged time on) inside a date
// range, with the time tracked WITHIN that range (period-accurate, not lifetime).
//
// Shape intentionally matches the project Timeline view's TimelineTicket so the
// frontend can reuse the existing <TimelineTree /> component verbatim.
//
// Every query filters `tenant_id = $1` explicitly (these are Prisma-owned tables
// reached through this module's own pool — no RLS safety net here).

import { TenantClient } from '../db/pool';

export interface TicketReportRow {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string | null;
  type: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  startDate: Date | null;
  endDate: Date | null;
  dueDate: Date | null;
  sprintName: string | null;
  estimateHours: number;
  trackedSeconds: number;
  /**
   * First day of the month the work was logged in — drives the timeline's month
   * grouping so a ticket appears under the month it was WORKED, not the month it
   * was originally started.
   */
  timelineAnchor: Date | null;
}

export interface TicketReportFilters {
  projectId?: string;
  memberId?: string;
  /** Inclusive YYYY-MM-DD bounds on the day the time was logged. */
  from: string;
  to: string;
}

/**
 * Tickets a member logged time against within [from, to].
 *
 * One row per (ticket, worker, work-month): `tracked_seconds` is that worker's
 * time logged inside the window for that month, and `assignee_name` is the
 * WORKER (so the timeline groups by who actually did the work). Splitting by
 * work-month means a ticket lands under the month it was worked — not the month
 * it was started — so a single-month range never bleeds into adjacent months.
 */
export async function findWorkedTickets(
  client: TenantClient,
  filters: TicketReportFilters
): Promise<TicketReportRow[]> {
  const params: any[] = [client.tenantId, filters.from, filters.to];
  const conditions: string[] = [
    'tte.tenant_id = $1',
    'tte.ticket_id IS NOT NULL',
    // start_time is a timestamptz; bound by the calendar day it was logged.
    'tte.start_time >= $2::date',
    "tte.start_time < ($3::date + interval '1 day')",
  ];

  if (filters.projectId) {
    params.push(filters.projectId);
    conditions.push(`t.project_id = $${params.length}`);
  }
  if (filters.memberId) {
    params.push(filters.memberId);
    conditions.push(`tte.user_id = $${params.length}`);
  }

  const { rows } = await client.query(
    `SELECT
        t.id,
        t.ticket_number,
        t.title,
        t.status,
        t.priority,
        t.type,
        t.start_date,
        t.end_date,
        t.due_date,
        t.estimate_hours,
        w.name        AS assignee_name,
        w.avatar_url  AS assignee_avatar,
        rp.version    AS sprint_name,
        date_trunc('month', tte.start_time) AS worked_month,
        COALESCE(SUM(tte.duration), 0) AS tracked_seconds
       FROM time_tracking_entries tte
       JOIN tickets t
         ON t.id = tte.ticket_id
        AND t.tenant_id = tte.tenant_id
        AND t.is_deleted = false
       JOIN users w ON w.id = tte.user_id
       LEFT JOIN release_plans rp ON rp.id = t.release_plan_id
      WHERE ${conditions.join('\n        AND ')}
      GROUP BY t.id, w.id, w.name, w.avatar_url, rp.version, date_trunc('month', tte.start_time)
      ORDER BY w.name ASC, worked_month ASC, t.ticket_number ASC`,
    params
  );

  return rows.map((row: any) => ({
    id: row.id,
    ticketNumber: row.ticket_number,
    title: row.title,
    status: row.status,
    priority: row.priority,
    type: row.type,
    assigneeName: row.assignee_name,
    assigneeAvatar: row.assignee_avatar,
    startDate: row.start_date,
    endDate: row.end_date,
    dueDate: row.due_date,
    sprintName: row.sprint_name,
    estimateHours: parseFloat(row.estimate_hours) || 0,
    trackedSeconds: parseInt(row.tracked_seconds, 10) || 0,
    timelineAnchor: row.worked_month,
  }));
}

// ─── Leaves (Leave Management 2.0) ───────────────────────────────────────────
export interface LeaveReportRow {
  id: string;
  userId: string;
  userName: string | null;
  leaveTypeName: string | null;
  fromDate: Date;
  toDate: Date;
  dayPortion: string;
  totalUnits: number;
  paidUnits: number;
  lopUnits: number;
  status: string;
  reason: string | null;
}

export interface LeaveReportFilters {
  memberId?: string;
  from: string;
  to: string;
}

/**
 * Leave 2.0 requests overlapping [from, to], optionally for one member.
 *
 * Reads the lv2_ tables directly (this module's pool sets the same
 * `app.current_tenant_id` GUC the lv2 RLS reads). lv2 keys on user_id (uuid)
 * while users.id is TEXT → join needs a cast. Leaves are not project-scoped.
 */
export async function findLeaveRequests(
  client: TenantClient,
  filters: LeaveReportFilters
): Promise<LeaveReportRow[]> {
  const params: any[] = [client.tenantId, filters.from, filters.to];
  const conditions: string[] = [
    'r.tenant_id = $1',
    // Overlap test: the leave intersects the [from, to] window.
    'r.from_date <= $3::date',
    'r.to_date >= $2::date',
  ];

  if (filters.memberId) {
    params.push(filters.memberId);
    conditions.push(`r.user_id = $${params.length}::uuid`);
  }

  const { rows } = await client.query(
    `SELECT
        r.id, r.user_id, u.name AS user_name,
        lt.name AS leave_type_name,
        r.from_date, r.to_date, r.day_portion,
        r.total_units, r.paid_units, r.lop_units, r.status, r.reason
       FROM lv2_leave_requests r
       JOIN lv2_leave_types lt ON lt.id = r.leave_type_id
       LEFT JOIN users u ON u.id = r.user_id::text
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY r.from_date DESC`,
    params
  );

  return rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    leaveTypeName: row.leave_type_name,
    fromDate: row.from_date,
    toDate: row.to_date,
    dayPortion: row.day_portion,
    totalUnits: Number(row.total_units) || 0,
    paidUnits: Number(row.paid_units) || 0,
    lopUnits: Number(row.lop_units) || 0,
    status: row.status,
    reason: row.reason,
  }));
}
