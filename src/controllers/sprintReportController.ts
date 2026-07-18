import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";
import {
  SprintReportAiService,
  SprintAiContext,
  AiNarrative,
} from "@/services/sprintReportAiService";
import { SprintReportExportService } from "@/services/sprintReportExportService";
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from "@/utils/transactionHistory";

// Status sets are matched case-insensitively against the real (per-tenant)
// workflow statuses, which vary widely. Keep these broad so delay/QA/blocked
// signals populate across the different status vocabularies teams use.
const DONE_STATUSES = ["completed", "live", "done", "closed", "shipped"];
const QA_STATUSES = [
  "in_testing",
  "in_review",
  "dev_testing",
  "devtesting",
  "live_testing",
  "qa",
  "testing",
  "review",
  "code_review",
  "uat",
];
const BLOCKED_STATUSES = ["blocked", "pause", "paused", "on_hold", "hold", "stalled"];

type SprintRow = {
  id: string;
  version: string | null;
  goal: string | null;
  status: string | null;
  start_date: Date | null;
  end_date: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  committed_points: number | null;
  completed_points: number | null;
  project_id: string | null;
  project_name: string | null;
  project_code: string | null;
};

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function pct(num: number, denom: number): number {
  if (!denom || denom <= 0) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

/** Fractional days between two timestamps (rounded to 1 decimal), or null. */
function cycleDaysBetween(
  start: Date | string | null,
  end: Date | string | null
): number | null {
  if (!start || !end) return null;
  const s = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const e = end instanceof Date ? end.getTime() : new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const days = (e - s) / 86_400_000;
  if (days < 0) return 0;
  return Math.round(days * 10) / 10;
}

function computeHealthScore(input: {
  completionPct: number;
  spilloverPct: number;
  addedAfterStartPct: number;
  blockedCount: number;
  totalTickets: number;
}): { score: number; band: "Healthy" | "Moderate Risk" | "High Risk" | "Critical Sprint" } {
  const blockedRatio = input.totalTickets > 0 ? input.blockedCount / input.totalTickets : 0;
  let score = 100;
  score -= Math.min(40, input.spilloverPct * 0.6);
  score -= Math.min(20, input.addedAfterStartPct * 0.4);
  score -= Math.min(20, blockedRatio * 100 * 0.8);
  score -= Math.max(0, 60 - input.completionPct) * 0.3;
  score = Math.max(0, Math.round(score));
  let band: "Healthy" | "Moderate Risk" | "High Risk" | "Critical Sprint";
  if (score >= 80) band = "Healthy";
  else if (score >= 60) band = "Moderate Risk";
  else if (score >= 40) band = "High Risk";
  else band = "Critical Sprint";
  return { score, band };
}

export class SprintReportController {
  /**
   * Returns the stored snapshot section for a completed sprint, or `undefined`
   * when no snapshot exists (callers should then compute the section live).
   * Each report handler short-circuits to this so completed sprints serve a
   * frozen report. The snapshot generator bypasses it via `req.bypassSnapshot`.
   */
  private static async _getSnapshotSection(
    tenantId: string,
    sprintId: string,
    key: string
  ): Promise<any | undefined> {
    try {
      const r = await pool.query(
        `SELECT report_data -> $3::text AS section
           FROM sprint_reports
          WHERE tenant_id = $1 AND sprint_id = $2
          LIMIT 1`,
        [tenantId, sprintId, key]
      );
      if (r.rowCount === 0) return undefined;
      const section = r.rows[0].section;
      return section == null ? undefined : section;
    } catch {
      // Missing table or any read error → fall back to live computation.
      return undefined;
    }
  }

  /**
   * GET /api/sprint-report/:sprintId
   * Returns Phase 1 sections: overview, ticket distribution, contribution.
   */
  static async getSprintReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      if (!(req as any).bypassSnapshot) {
        const snapshot = await SprintReportController._getSnapshotSection(tenantId, sprintId, "main");
        if (snapshot !== undefined) {
          res.json({ success: true, data: snapshot } as ApiResponse);
          return;
        }
      }

      const sprintResult = await pool.query<SprintRow>(
        `SELECT rp.id, rp.version, rp.goal, rp.status,
                rp.start_date, rp.end_date, rp.started_at, rp.completed_at,
                rp.committed_points, rp.completed_points, rp.project_id,
                p.name AS project_name, p.code AS project_code
           FROM release_plans rp
           LEFT JOIN projects p ON p.id = rp.project_id
          WHERE rp.id = $1 AND rp.tenant_id = $2 AND rp.type = 'sprint_plan'
          LIMIT 1`,
        [sprintId, tenantId]
      );

      if (sprintResult.rowCount === 0) {
        res.status(404).json({ success: false, error: "Sprint not found" } as ApiResponse);
        return;
      }

      const sprint = sprintResult.rows[0];
      const sprintStartAnchor = sprint.started_at ?? sprint.start_date;

      const [
        aggregates,
        typeDist,
        statusDist,
        priorityDist,
        pointBucketDist,
        assigneeDist,
        contribution,
        scopeChange,
      ] = await Promise.all([
        pool.query(
          `SELECT
              COUNT(*)::int AS total_tickets,
              COUNT(*) FILTER (WHERE LOWER(status) = ANY($3))::int AS done_tickets,
              COUNT(*) FILTER (WHERE LOWER(status) = ANY($4))::int AS qa_tickets,
              COUNT(*) FILTER (WHERE LOWER(status) = ANY($5))::int AS blocked_tickets,
              COALESCE(SUM(story_point), 0)::int AS planned_points,
              COALESCE(SUM(story_point) FILTER (WHERE LOWER(status) = ANY($3)), 0)::int AS done_points,
              COUNT(DISTINCT assignee_id) FILTER (WHERE assignee_id IS NOT NULL)::int AS team_size,
              COUNT(*) FILTER (WHERE LOWER(type) = 'bug')::int AS bug_count,
              COUNT(*) FILTER (WHERE LOWER(type) IS DISTINCT FROM 'bug')::int AS feature_count
            FROM tickets
            WHERE sprint_plan_id = $1 AND tenant_id = $2 AND is_deleted = false`,
          [sprintId, tenantId, DONE_STATUSES, QA_STATUSES, BLOCKED_STATUSES]
        ),
        pool.query(
          `SELECT COALESCE(NULLIF(TRIM(type), ''), 'Unknown') AS label,
                  COUNT(*)::int AS count,
                  COALESCE(SUM(story_point), 0)::int AS points
             FROM tickets
            WHERE sprint_plan_id = $1 AND tenant_id = $2 AND is_deleted = false
            GROUP BY 1
            ORDER BY count DESC`,
          [sprintId, tenantId]
        ),
        pool.query(
          `SELECT COALESCE(NULLIF(TRIM(status), ''), 'unknown') AS label,
                  COUNT(*)::int AS count,
                  COALESCE(SUM(story_point), 0)::int AS points
             FROM tickets
            WHERE sprint_plan_id = $1 AND tenant_id = $2 AND is_deleted = false
            GROUP BY 1
            ORDER BY count DESC`,
          [sprintId, tenantId]
        ),
        pool.query(
          `SELECT COALESCE(NULLIF(TRIM(priority), ''), 'Unset') AS label,
                  COUNT(*)::int AS count,
                  COALESCE(SUM(story_point), 0)::int AS points
             FROM tickets
            WHERE sprint_plan_id = $1 AND tenant_id = $2 AND is_deleted = false
            GROUP BY 1
            ORDER BY count DESC`,
          [sprintId, tenantId]
        ),
        pool.query(
          `WITH buckets AS (
             SELECT
               CASE
                 WHEN story_point IS NULL THEN 'Unestimated'
                 WHEN story_point BETWEEN 1 AND 3 THEN '1-3'
                 WHEN story_point BETWEEN 4 AND 8 THEN '5-8'
                 WHEN story_point >= 13 THEN '13+'
                 ELSE 'Other'
               END AS label,
               COUNT(*)::int AS count
             FROM tickets
             WHERE sprint_plan_id = $1 AND tenant_id = $2 AND is_deleted = false
             GROUP BY 1
           )
           SELECT label, count FROM buckets
           ORDER BY CASE label
             WHEN '1-3' THEN 1
             WHEN '5-8' THEN 2
             WHEN '13+' THEN 3
             WHEN 'Other' THEN 4
             WHEN 'Unestimated' THEN 5
             ELSE 6
           END`,
          [sprintId, tenantId]
        ),
        pool.query(
          `SELECT
              t.assignee_id,
              COALESCE(u.name, 'Unassigned') AS assignee_name,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE LOWER(t.status) = ANY($3))::int AS completed,
              COALESCE(SUM(t.story_point), 0)::int AS points,
              COALESCE(SUM(t.story_point) FILTER (WHERE LOWER(t.status) = ANY($3)), 0)::int AS completed_points
            FROM tickets t
            LEFT JOIN users u ON u.id = t.assignee_id
            WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
            GROUP BY t.assignee_id, u.name
            ORDER BY total DESC`,
          [sprintId, tenantId, DONE_STATUSES]
        ),
        pool.query(
          `SELECT
              t.assignee_id,
              COALESCE(u.name, 'Unassigned') AS user_name,
              COUNT(*)::int AS total_assigned,
              COUNT(*) FILTER (WHERE LOWER(t.status) = ANY($3))::int AS tickets_completed,
              COALESCE(SUM(t.story_point) FILTER (WHERE LOWER(t.status) = ANY($3)), 0)::int AS points_delivered,
              COUNT(*) FILTER (WHERE LOWER(t.type) = 'bug' AND LOWER(t.status) = ANY($3))::int AS bugs_fixed,
              COUNT(*) FILTER (
                WHERE LOWER(COALESCE(t.priority, '')) LIKE '%critical%'
                   OR LOWER(COALESCE(t.priority, '')) LIKE '%p0%'
                   OR LOWER(COALESCE(t.priority, '')) LIKE '%p1%'
                   OR LOWER(COALESCE(t.priority, '')) LIKE '%high%'
              )::int AS critical_handled,
              AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 86400.0)
                FILTER (WHERE t.completed_at IS NOT NULL) AS avg_completion_days
            FROM tickets t
            LEFT JOIN users u ON u.id = t.assignee_id
            WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
            GROUP BY t.assignee_id, u.name
            ORDER BY tickets_completed DESC, points_delivered DESC`,
          [sprintId, tenantId, DONE_STATUSES]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS added_after_start
             FROM sprint_completion_logs
            WHERE sprint_plan_id = $1
              AND tenant_id = $2
              AND action = 'moved_to_sprint'
              AND ($3::timestamp IS NULL OR performed_at > $3::timestamp)`,
          [sprintId, tenantId, sprintStartAnchor]
        ),
      ]);

      const agg = aggregates.rows[0] ?? {};
      const totalTickets = Number(agg.total_tickets ?? 0);
      const doneTickets = Number(agg.done_tickets ?? 0);
      const qaTickets = Number(agg.qa_tickets ?? 0);
      const blockedTickets = Number(agg.blocked_tickets ?? 0);
      const plannedPoints = Number(agg.planned_points ?? 0);
      const donePoints = Number(agg.done_points ?? 0);
      const teamSize = Number(agg.team_size ?? 0);
      const bugCount = Number(agg.bug_count ?? 0);
      const featureCount = Number(agg.feature_count ?? 0);
      const addedAfterStart = Number(scopeChange.rows[0]?.added_after_start ?? 0);

      const completionPct = pct(doneTickets, totalTickets);
      const pointCompletionPct = pct(donePoints, plannedPoints);
      const spilloverPct = pct(totalTickets - doneTickets, totalTickets);
      const addedAfterStartPct = pct(addedAfterStart, totalTickets);
      const bugRatioPct = pct(bugCount, totalTickets);

      const health = computeHealthScore({
        completionPct,
        spilloverPct,
        addedAfterStartPct,
        blockedCount: blockedTickets,
        totalTickets,
      });

      const overview = {
        sprintId: sprint.id,
        sprintName: sprint.version,
        goal: sprint.goal,
        status: sprint.status,
        projectId: sprint.project_id,
        projectName: sprint.project_name,
        projectCode: sprint.project_code,
        startDate: sprint.started_at ?? sprint.start_date,
        endDate: sprint.completed_at ?? sprint.end_date,
        durationDays: daysBetween(
          sprint.started_at ?? sprint.start_date,
          sprint.completed_at ?? sprint.end_date
        ),
        // Planned vs actual dates, kept separate for the header. `delayDays` is how
        // far the sprint ran past its planned end (uses completion date when the
        // sprint is closed, otherwise "now" for an in-flight sprint). 0 = on time.
        plannedStartDate: sprint.start_date,
        plannedEndDate: sprint.end_date,
        actualStartDate: sprint.started_at,
        actualEndDate: sprint.completed_at,
        delayDays: sprint.end_date
          ? daysBetween(sprint.end_date, sprint.completed_at ?? new Date())
          : null,
        teamSize,
        totalTickets,
        plannedStoryPoints: plannedPoints,
        completedStoryPoints: donePoints,
        completionPct,
        pointCompletionPct,
        spilloverPct,
        addedAfterStart,
        addedAfterStartPct,
        bugCount,
        featureCount,
        bugRatioPct,
        qaTickets,
        blockedTickets,
        healthScore: health.score,
        healthBand: health.band,
      };

      const ticketDistribution = {
        byType: typeDist.rows,
        byStatus: statusDist.rows,
        byPriority: priorityDist.rows,
        byStoryPointBucket: pointBucketDist.rows,
        byAssignee: assigneeDist.rows.map((r) => ({
          assigneeId: r.assignee_id,
          assigneeName: r.assignee_name,
          total: Number(r.total ?? 0),
          completed: Number(r.completed ?? 0),
          points: Number(r.points ?? 0),
          completedPoints: Number(r.completed_points ?? 0),
        })),
      };

      const contributors = contribution.rows.map((r) => ({
        userId: r.assignee_id,
        userName: r.user_name,
        totalAssigned: Number(r.total_assigned ?? 0),
        ticketsCompleted: Number(r.tickets_completed ?? 0),
        pointsDelivered: Number(r.points_delivered ?? 0),
        bugsFixed: Number(r.bugs_fixed ?? 0),
        criticalHandled: Number(r.critical_handled ?? 0),
        avgCompletionDays:
          r.avg_completion_days == null
            ? null
            : Math.round(Number(r.avg_completion_days) * 10) / 10,
      }));

      res.json({
        success: true,
        data: { overview, ticketDistribution, contribution: contributors },
      } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportController] getSprintReport error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to build sprint report",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/sprint-report/:sprintId/timeline
   * Per-ticket delay, transition counts, reopen counts + aggregate slices.
   */
  static async getSprintTimeline(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      if (!(req as any).bypassSnapshot) {
        const snapshot = await SprintReportController._getSnapshotSection(tenantId, sprintId, "timeline");
        if (snapshot !== undefined) {
          res.json({ success: true, data: snapshot } as ApiResponse);
          return;
        }
      }

      const sprintResult = await pool.query<SprintRow>(
        `SELECT id, version, started_at, start_date, completed_at, end_date
           FROM release_plans
          WHERE id = $1 AND tenant_id = $2 AND type = 'sprint_plan'
          LIMIT 1`,
        [sprintId, tenantId]
      );
      if (sprintResult.rowCount === 0) {
        res.status(404).json({ success: false, error: "Sprint not found" } as ApiResponse);
        return;
      }

      // Per-ticket timeline + delay
      const perTicket = await pool.query(
        `WITH status_events AS (
            SELECT
              tal.ticket_id,
              tal.timestamp,
              LOWER(tal.details->>'newStatus') AS new_status,
              LOWER(tal.details->>'oldStatus') AS old_status
            FROM ticket_activity_log tal
            JOIN tickets t ON t.id = tal.ticket_id
            WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
              AND tal.tenant_id = $2
              AND tal.action = 'Ticket Updated'
              AND tal.details->>'newStatus' IS NOT NULL
         ),
         event_agg AS (
            SELECT
              ticket_id,
              MIN(timestamp) FILTER (WHERE new_status = 'in_progress') AS first_started_at,
              MIN(timestamp) FILTER (WHERE new_status = ANY($4)) AS first_qa_at,
              MIN(timestamp) FILTER (WHERE new_status = ANY($3)) AS first_done_at,
              COUNT(*)::int AS transition_count,
              COUNT(*) FILTER (
                WHERE old_status = ANY($3) AND NOT (new_status = ANY($3))
              )::int AS reopen_count
            FROM status_events
            GROUP BY ticket_id
         )
         SELECT
           t.id,
           t.ticket_number,
           t.title,
           t.type,
           t.status,
           t.priority,
           t.story_point,
           t.assignee_id,
           u.name AS assignee_name,
           t.created_at,
           t.due_date,
           t.start_date AS planned_start,
           t.end_date AS planned_end,
           t.completed_at,
           ea.first_started_at,
           ea.first_qa_at,
           ea.first_done_at,
           COALESCE(ea.transition_count, 0) AS transition_count,
           COALESCE(ea.reopen_count, 0) AS reopen_count,
           CASE
             WHEN t.due_date IS NOT NULL THEN
               GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(t.completed_at, NOW()) - t.due_date)) / 86400.0)
             ELSE NULL
           END AS delay_days
         FROM tickets t
         LEFT JOIN users u ON u.id = t.assignee_id
         LEFT JOIN event_agg ea ON ea.ticket_id = t.id
         WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
         ORDER BY delay_days DESC NULLS LAST, reopen_count DESC, transition_count DESC
         LIMIT 200`,
        [sprintId, tenantId, DONE_STATUSES, QA_STATUSES]
      );

      const tickets = perTicket.rows.map((r: any) => ({
        ticketId: r.id,
        ticketNumber: r.ticket_number,
        title: r.title,
        type: r.type,
        status: r.status,
        priority: r.priority,
        storyPoint: r.story_point,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        createdAt: r.created_at,
        dueDate: r.due_date,
        plannedStart: r.planned_start,
        plannedEnd: r.planned_end,
        firstStartedAt: r.first_started_at,
        firstQaAt: r.first_qa_at,
        firstDoneAt: r.first_done_at,
        completedAt: r.completed_at,
        transitionCount: Number(r.transition_count ?? 0),
        reopenCount: Number(r.reopen_count ?? 0),
        delayDays:
          r.delay_days == null ? null : Math.round(Number(r.delay_days) * 10) / 10,
        // Cycle time = first "in progress" (or creation) → first "done" transition.
        // Derived from the activity log so it works even when due_date /
        // completed_at columns are empty.
        cycleDays: cycleDaysBetween(
          r.first_started_at ?? r.created_at,
          r.first_done_at ?? r.completed_at
        ),
      }));

      const delayedTickets = tickets.filter((t) => (t.delayDays ?? 0) > 0);
      const completedCycleTickets = tickets.filter((t) => t.cycleDays != null);
      const avgCycleDays =
        completedCycleTickets.length === 0
          ? 0
          : Math.round(
              (completedCycleTickets.reduce((s, t) => s + (t.cycleDays ?? 0), 0) /
                completedCycleTickets.length) *
                10
            ) / 10;
      const longestCycleTicket = completedCycleTickets.reduce<typeof tickets[number] | null>(
        (acc, t) => (acc == null || (t.cycleDays ?? 0) > (acc.cycleDays ?? 0) ? t : acc),
        null
      );
      const cycleByAssigneeMap = new Map<
        string,
        { assigneeId: string | null; assigneeName: string; total: number; count: number }
      >();
      for (const t of completedCycleTickets) {
        const key = t.assigneeId ?? "unassigned";
        const bucket = cycleByAssigneeMap.get(key) ?? {
          assigneeId: t.assigneeId,
          assigneeName: t.assigneeName ?? "Unassigned",
          total: 0,
          count: 0,
        };
        bucket.total += t.cycleDays ?? 0;
        bucket.count += 1;
        cycleByAssigneeMap.set(key, bucket);
      }
      const avgDelay =
        delayedTickets.length === 0
          ? 0
          : Math.round(
              (delayedTickets.reduce((s, t) => s + (t.delayDays ?? 0), 0) /
                delayedTickets.length) *
                10
            ) / 10;
      const longestDelay = tickets.reduce<typeof tickets[number] | null>(
        (acc, t) => (acc == null || (t.delayDays ?? 0) > (acc.delayDays ?? 0) ? t : acc),
        null
      );

      const delayByAssignee = new Map<
        string,
        { assigneeId: string | null; assigneeName: string; totalDelay: number; count: number }
      >();
      const delayByType = new Map<
        string,
        { type: string; totalDelay: number; count: number }
      >();
      for (const t of delayedTickets) {
        const key = t.assigneeId ?? "unassigned";
        const bucket = delayByAssignee.get(key) ?? {
          assigneeId: t.assigneeId,
          assigneeName: t.assigneeName ?? "Unassigned",
          totalDelay: 0,
          count: 0,
        };
        bucket.totalDelay += t.delayDays ?? 0;
        bucket.count += 1;
        delayByAssignee.set(key, bucket);

        const typeKey = (t.type ?? "Unknown").toString();
        const tBucket = delayByType.get(typeKey) ?? {
          type: typeKey,
          totalDelay: 0,
          count: 0,
        };
        tBucket.totalDelay += t.delayDays ?? 0;
        tBucket.count += 1;
        delayByType.set(typeKey, tBucket);
      }

      const totalReopens = tickets.reduce((s, t) => s + t.reopenCount, 0);
      const highComplexity = tickets.filter(
        (t) => t.transitionCount >= 8 || t.reopenCount >= 2
      );

      res.json({
        success: true,
        data: {
          tickets,
          aggregates: {
            totalTickets: tickets.length,
            delayedCount: delayedTickets.length,
            avgDelayDays: avgDelay,
            completedCount: completedCycleTickets.length,
            avgCycleDays,
            longestCycle:
              longestCycleTicket && (longestCycleTicket.cycleDays ?? 0) > 0
                ? {
                    ticketId: longestCycleTicket.ticketId,
                    ticketNumber: longestCycleTicket.ticketNumber,
                    title: longestCycleTicket.title,
                    cycleDays: longestCycleTicket.cycleDays,
                  }
                : null,
            cycleByAssignee: Array.from(cycleByAssigneeMap.values())
              .map((b) => ({
                assigneeId: b.assigneeId,
                assigneeName: b.assigneeName,
                avgCycle: Math.round((b.total / b.count) * 10) / 10,
                count: b.count,
              }))
              .sort((a, b) => b.avgCycle - a.avgCycle),
            longestDelay: longestDelay && (longestDelay.delayDays ?? 0) > 0
              ? {
                  ticketId: longestDelay.ticketId,
                  ticketNumber: longestDelay.ticketNumber,
                  title: longestDelay.title,
                  delayDays: longestDelay.delayDays,
                }
              : null,
            totalReopens,
            highComplexityCount: highComplexity.length,
            delayByAssignee: Array.from(delayByAssignee.values())
              .map((b) => ({
                assigneeId: b.assigneeId,
                assigneeName: b.assigneeName,
                avgDelay: Math.round((b.totalDelay / b.count) * 10) / 10,
                count: b.count,
              }))
              .sort((a, b) => b.avgDelay - a.avgDelay),
            delayByType: Array.from(delayByType.values())
              .map((b) => ({
                type: b.type,
                avgDelay: Math.round((b.totalDelay / b.count) * 10) / 10,
                count: b.count,
              }))
              .sort((a, b) => b.avgDelay - a.avgDelay),
          },
        },
      } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportController] getSprintTimeline error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to build sprint timeline",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/sprint-report/:sprintId/scope
   * Planned vs added-mid-sprint vs removed, with per-user breakdown.
   */
  static async getSprintScopeChange(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      if (!(req as any).bypassSnapshot) {
        const snapshot = await SprintReportController._getSnapshotSection(tenantId, sprintId, "scope");
        if (snapshot !== undefined) {
          res.json({ success: true, data: snapshot } as ApiResponse);
          return;
        }
      }

      const sprintResult = await pool.query<SprintRow>(
        `SELECT id, started_at, start_date, completed_at, end_date
           FROM release_plans
          WHERE id = $1 AND tenant_id = $2 AND type = 'sprint_plan'
          LIMIT 1`,
        [sprintId, tenantId]
      );
      if (sprintResult.rowCount === 0) {
        res.status(404).json({ success: false, error: "Sprint not found" } as ApiResponse);
        return;
      }
      const sprint = sprintResult.rows[0];
      const sprintStart = sprint.started_at ?? sprint.start_date;
      const sprintEnd = sprint.completed_at ?? sprint.end_date;

      // Classification proxy:
      //   planned = currently in sprint AND no moved_to_sprint event AFTER sprint_start
      //             (or ticket created before sprint started)
      //   added_after = ticket was moved into sprint after start, OR created after start
      const classified = await pool.query(
        `WITH current_tickets AS (
            SELECT t.id, t.created_at, t.story_point, t.type, t.created_by_id
              FROM tickets t
             WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
         ),
         move_in_after AS (
            SELECT DISTINCT scl.ticket_id, MIN(scl.performed_at) AS moved_at,
                   (ARRAY_AGG(scl.performed_by_id ORDER BY scl.performed_at))[1] AS performed_by_id
              FROM sprint_completion_logs scl
             WHERE scl.sprint_plan_id = $1 AND scl.tenant_id = $2
               AND scl.action = 'moved_to_sprint'
               AND ($3::timestamp IS NULL OR scl.performed_at > $3::timestamp)
             GROUP BY scl.ticket_id
         )
         SELECT
           ct.id,
           ct.story_point,
           ct.type,
           CASE
             WHEN mia.ticket_id IS NOT NULL THEN 'added_after'
             WHEN $3::timestamp IS NOT NULL AND ct.created_at > $3::timestamp THEN 'added_after'
             ELSE 'planned'
           END AS classification,
           COALESCE(mia.performed_by_id, ct.created_by_id) AS responsible_user_id
         FROM current_tickets ct
         LEFT JOIN move_in_after mia ON mia.ticket_id = ct.id`,
        [sprintId, tenantId, sprintStart]
      );

      // Removed during sprint window
      const removed = await pool.query(
        `SELECT
            scl.action,
            scl.ticket_id,
            scl.performed_by_id,
            scl.performed_at,
            t.story_point,
            t.type
         FROM sprint_completion_logs scl
         LEFT JOIN tickets t ON t.id = scl.ticket_id
         WHERE scl.sprint_plan_id = $1 AND scl.tenant_id = $2
           AND scl.action IN ('moved_to_bucket','moved_to_backlog','moved_to_trash')
           AND ($3::timestamp IS NULL OR scl.performed_at > $3::timestamp)
           AND ($4::timestamp IS NULL OR scl.performed_at <= $4::timestamp)`,
        [sprintId, tenantId, sprintStart, sprintEnd]
      );

      // Per-user breakdown of who added scope
      const scopeAddersMap = new Map<
        string,
        { userId: string | null; userName: string; tickets: number; points: number }
      >();
      const userIds = new Set<string>();
      for (const r of classified.rows) {
        if (r.classification === "added_after" && r.responsible_user_id) {
          userIds.add(r.responsible_user_id);
        }
      }
      for (const r of removed.rows) {
        if (r.performed_by_id) userIds.add(r.performed_by_id);
      }

      let userNamesById = new Map<string, string>();
      if (userIds.size > 0) {
        const userResult = await pool.query(
          `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::text[])`,
          [tenantId, Array.from(userIds)]
        );
        userNamesById = new Map(userResult.rows.map((r: any) => [r.id, r.name]));
      }

      for (const r of classified.rows) {
        if (r.classification !== "added_after") continue;
        const key = r.responsible_user_id ?? "unknown";
        const bucket = scopeAddersMap.get(key) ?? {
          userId: r.responsible_user_id ?? null,
          userName: userNamesById.get(r.responsible_user_id ?? "") ?? "Unknown",
          tickets: 0,
          points: 0,
        };
        bucket.tickets += 1;
        bucket.points += Number(r.story_point ?? 0);
        scopeAddersMap.set(key, bucket);
      }

      let plannedTickets = 0;
      let plannedPoints = 0;
      let addedTickets = 0;
      let addedPoints = 0;
      const addedByType = new Map<string, number>();
      for (const r of classified.rows) {
        const sp = Number(r.story_point ?? 0);
        if (r.classification === "planned") {
          plannedTickets += 1;
          plannedPoints += sp;
        } else {
          addedTickets += 1;
          addedPoints += sp;
          const tKey = (r.type ?? "Unknown").toString();
          addedByType.set(tKey, (addedByType.get(tKey) ?? 0) + 1);
        }
      }

      const removedTickets = removed.rows.length;
      const removedPoints = removed.rows.reduce(
        (s: number, r: any) => s + Number(r.story_point ?? 0),
        0
      );

      const totalTickets = plannedTickets + addedTickets;
      const scopeIncreasePct = pct(addedTickets, plannedTickets || 1);
      const capacityDisruptionPct = pct(addedPoints, plannedPoints || 1);

      res.json({
        success: true,
        data: {
          summary: {
            plannedTickets,
            plannedPoints,
            addedTickets,
            addedPoints,
            removedTickets,
            removedPoints,
            totalTickets,
            scopeIncreasePct,
            capacityDisruptionPct,
          },
          scopeAdders: Array.from(scopeAddersMap.values()).sort(
            (a, b) => b.tickets - a.tickets
          ),
          addedByType: Array.from(addedByType.entries())
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count),
          removedEvents: removed.rows.map((r: any) => ({
            ticketId: r.ticket_id,
            action: r.action,
            performedAt: r.performed_at,
            performedById: r.performed_by_id,
            performedByName: userNamesById.get(r.performed_by_id ?? "") ?? null,
            storyPoint: Number(r.story_point ?? 0),
            type: r.type,
          })),
        },
      } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportController] getSprintScopeChange error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to build sprint scope analysis",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/sprint-report/:sprintId/velocity
   * Daily completion counts + cumulative burndown + pace insights.
   */
  static async getSprintVelocity(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      if (!(req as any).bypassSnapshot) {
        const snapshot = await SprintReportController._getSnapshotSection(tenantId, sprintId, "velocity");
        if (snapshot !== undefined) {
          res.json({ success: true, data: snapshot } as ApiResponse);
          return;
        }
      }

      const sprintResult = await pool.query<SprintRow>(
        `SELECT id, version, started_at, start_date, completed_at, end_date
           FROM release_plans
          WHERE id = $1 AND tenant_id = $2 AND type = 'sprint_plan'
          LIMIT 1`,
        [sprintId, tenantId]
      );
      if (sprintResult.rowCount === 0) {
        res.status(404).json({ success: false, error: "Sprint not found" } as ApiResponse);
        return;
      }
      const sprint = sprintResult.rows[0];
      const sprintStart = sprint.started_at ?? sprint.start_date;
      const sprintEnd = sprint.completed_at ?? sprint.end_date;

      if (!sprintStart) {
        res.json({
          success: true,
          data: {
            days: [],
            cumulative: [],
            totals: { tickets: 0, points: 0 },
            insights: [],
            ideal: [],
            plannedPoints: 0,
          },
        } as ApiResponse);
        return;
      }

      const totalsRow = await pool.query(
        `SELECT
            COALESCE(SUM(story_point), 0)::int AS planned_points,
            COUNT(*)::int AS planned_tickets
           FROM tickets
          WHERE sprint_plan_id = $1 AND tenant_id = $2 AND is_deleted = false`,
        [sprintId, tenantId]
      );
      const plannedPoints = Number(totalsRow.rows[0]?.planned_points ?? 0);
      const plannedTickets = Number(totalsRow.rows[0]?.planned_tickets ?? 0);

      const daily = await pool.query(
        `WITH sprint_window AS (
            SELECT
              $3::date AS sprint_start,
              LEAST($4::date, CURRENT_DATE) AS sprint_end
         ),
         days AS (
            SELECT generate_series(
                     (SELECT sprint_start FROM sprint_window),
                     (SELECT sprint_end FROM sprint_window),
                     '1 day'::interval
                   )::date AS day
         ),
         completions AS (
            SELECT
              (tal.timestamp AT TIME ZONE 'UTC')::date AS day,
              tal.ticket_id,
              t.story_point
            FROM ticket_activity_log tal
            JOIN tickets t ON t.id = tal.ticket_id
            WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
              AND tal.tenant_id = $2
              AND tal.action = 'Ticket Updated'
              AND LOWER(tal.details->>'newStatus') = ANY($5)
              AND (
                tal.details->>'oldStatus' IS NULL
                OR NOT (LOWER(tal.details->>'oldStatus') = ANY($5))
              )
         ),
         daily_agg AS (
            SELECT day,
                   COUNT(*)::int AS tickets,
                   COALESCE(SUM(story_point), 0)::int AS points
              FROM completions
             GROUP BY day
         )
         SELECT d.day,
                COALESCE(da.tickets, 0) AS tickets,
                COALESCE(da.points, 0) AS points
           FROM days d
           LEFT JOIN daily_agg da ON da.day = d.day
          ORDER BY d.day`,
        [sprintId, tenantId, sprintStart, sprintEnd ?? new Date(), DONE_STATUSES]
      );

      const days = daily.rows.map((r: any) => ({
        day: r.day,
        tickets: Number(r.tickets ?? 0),
        points: Number(r.points ?? 0),
      }));

      let cumTickets = 0;
      let cumPoints = 0;
      const cumulative = days.map((d: { day: any; tickets: number; points: number }) => {
        cumTickets += d.tickets;
        cumPoints += d.points;
        return { day: d.day, tickets: cumTickets, points: cumPoints };
      });

      const totalTickets = cumTickets;
      const totalPoints = cumPoints;

      const ideal: { day: string; points: number }[] = [];
      if (days.length > 1) {
        const step = plannedPoints / (days.length - 1);
        for (let i = 0; i < days.length; i++) {
          ideal.push({
            day: days[i].day,
            points: Math.round((plannedPoints - step * i) * 10) / 10,
          });
        }
      }

      // Pace insights
      const insights: string[] = [];
      if (days.length >= 4) {
        const last2 = days.slice(-2).reduce((s: number, d: { tickets: number }) => s + d.tickets, 0);
        if (totalTickets > 0 && last2 / totalTickets >= 0.4) {
          insights.push(
            `${Math.round((last2 / totalTickets) * 100)}% of sprint completions happened in the final 2 days.`
          );
        }
        const first2 = days.slice(0, 2).reduce((s: number, d: { tickets: number }) => s + d.tickets, 0);
        if (totalTickets > 0 && first2 === 0) {
          insights.push("No tickets completed in the first 2 days of the sprint.");
        }
        const midStart = Math.floor(days.length / 3);
        const midEnd = Math.floor((days.length * 2) / 3);
        const midSlice = days.slice(midStart, midEnd);
        const midSum = midSlice.reduce((s: number, d: { tickets: number }) => s + d.tickets, 0);
        if (midSlice.length >= 3 && totalTickets > 0 && midSum / totalTickets < 0.15) {
          insights.push("Mid-sprint stagnation detected: <15% of completions in the middle third.");
        }
      }
      if (plannedPoints > 0 && totalPoints / plannedPoints < 0.5 && days.length >= 5) {
        insights.push(
          `Tracking behind plan — ${Math.round((totalPoints / plannedPoints) * 100)}% of points burned with ${days.length} days elapsed.`
        );
      }

      res.json({
        success: true,
        data: {
          days,
          cumulative,
          ideal,
          totals: { tickets: totalTickets, points: totalPoints },
          plannedPoints,
          plannedTickets,
          insights,
        },
      } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportController] getSprintVelocity error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to build sprint velocity",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/sprint-report/:sprintId/quality
   * Per-ticket complexity score + rework/reopen analysis.
   */
  static async getSprintQuality(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }
      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      if (!(req as any).bypassSnapshot) {
        const snapshot = await SprintReportController._getSnapshotSection(tenantId, sprintId, "quality");
        if (snapshot !== undefined) {
          res.json({ success: true, data: snapshot } as ApiResponse);
          return;
        }
      }

      const sprintCheck = await pool.query(
        `SELECT id FROM release_plans WHERE id = $1 AND tenant_id = $2 AND type = 'sprint_plan' LIMIT 1`,
        [sprintId, tenantId]
      );
      if (sprintCheck.rowCount === 0) {
        res.status(404).json({ success: false, error: "Sprint not found" } as ApiResponse);
        return;
      }

      const complexity = await pool.query(
        `WITH base AS (
            SELECT t.id, t.ticket_number, t.title, t.type, t.status, t.priority,
                   t.story_point, t.assignee_id,
                   u.name AS assignee_name,
                   COALESCE(array_length(t.parent_tickets, 1), 0) AS linked_count
              FROM tickets t
              LEFT JOIN users u ON u.id = t.assignee_id
             WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
         ),
         subtask_counts AS (
            SELECT parent_id, COUNT(*)::int AS subtask_count
              FROM tickets
             WHERE tenant_id = $2 AND parent_id IS NOT NULL AND is_deleted = false
             GROUP BY parent_id
         ),
         log_agg AS (
            SELECT
              tal.ticket_id,
              COUNT(*) FILTER (WHERE tal.action = 'Comment Added')::int AS comment_count,
              COUNT(*) FILTER (
                WHERE tal.action = 'Ticket Updated' AND tal.details->>'newStatus' IS NOT NULL
              )::int AS status_transitions,
              COUNT(*) FILTER (
                WHERE tal.action = 'Ticket Updated'
                  AND LOWER(tal.details->>'oldStatus') = ANY($3)
                  AND NOT (LOWER(tal.details->>'newStatus') = ANY($3))
              )::int AS reopen_count,
              COUNT(*) FILTER (
                WHERE tal.action = 'Ticket Updated'
                  AND LOWER(tal.details->>'oldStatus') = ANY($4)
                  AND LOWER(tal.details->>'newStatus') = 'in_progress'
              )::int AS qa_rejection_count
            FROM ticket_activity_log tal
            WHERE tal.tenant_id = $2 AND tal.ticket_id IN (SELECT id FROM base)
            GROUP BY tal.ticket_id
         )
         SELECT
           b.id, b.ticket_number, b.title, b.type, b.status, b.priority,
           b.story_point, b.assignee_id, b.assignee_name, b.linked_count,
           COALESCE(sc.subtask_count, 0) AS subtask_count,
           COALESCE(la.comment_count, 0) AS comment_count,
           COALESCE(la.status_transitions, 0) AS status_transitions,
           COALESCE(la.reopen_count, 0) AS reopen_count,
           COALESCE(la.qa_rejection_count, 0) AS qa_rejection_count
         FROM base b
         LEFT JOIN subtask_counts sc ON sc.parent_id = b.id
         LEFT JOIN log_agg la ON la.ticket_id = b.id
         ORDER BY
           (COALESCE(sc.subtask_count, 0) * 3
            + COALESCE(la.comment_count, 0) * 1.5
            + COALESCE(la.status_transitions, 0) * 1.5
            + b.linked_count * 2
            + COALESCE(la.reopen_count, 0) * 10
            + COALESCE(la.qa_rejection_count, 0) * 5) DESC
         LIMIT 50`,
        [sprintId, tenantId, DONE_STATUSES, QA_STATUSES]
      );

      const tickets = complexity.rows.map((r: any) => {
        const subtaskCount = Number(r.subtask_count ?? 0);
        const commentCount = Number(r.comment_count ?? 0);
        const transitions = Number(r.status_transitions ?? 0);
        const linked = Number(r.linked_count ?? 0);
        const reopens = Number(r.reopen_count ?? 0);
        const qaRejections = Number(r.qa_rejection_count ?? 0);
        const score =
          subtaskCount * 3 +
          commentCount * 1.5 +
          transitions * 1.5 +
          linked * 2 +
          reopens * 10 +
          qaRejections * 5;
        return {
          ticketId: r.id,
          ticketNumber: r.ticket_number,
          title: r.title,
          type: r.type,
          status: r.status,
          priority: r.priority,
          storyPoint: r.story_point,
          assigneeId: r.assignee_id,
          assigneeName: r.assignee_name,
          subtaskCount,
          commentCount,
          statusTransitions: transitions,
          linkedCount: linked,
          reopenCount: reopens,
          qaRejectionCount: qaRejections,
          complexityScore: Math.round(score * 10) / 10,
        };
      });

      const totalTickets = tickets.length;
      const reopenedTickets = tickets.filter((t) => t.reopenCount > 0);
      const qaRejected = tickets.filter((t) => t.qaRejectionCount > 0);
      const totalReopens = tickets.reduce((s, t) => s + t.reopenCount, 0);
      const totalQaRejections = tickets.reduce((s, t) => s + t.qaRejectionCount, 0);

      const reopenByAssigneeMap = new Map<
        string,
        { assigneeId: string | null; assigneeName: string; reopens: number; qaRejections: number }
      >();
      for (const t of tickets) {
        if (t.reopenCount === 0 && t.qaRejectionCount === 0) continue;
        const key = t.assigneeId ?? "unassigned";
        const bucket = reopenByAssigneeMap.get(key) ?? {
          assigneeId: t.assigneeId,
          assigneeName: t.assigneeName ?? "Unassigned",
          reopens: 0,
          qaRejections: 0,
        };
        bucket.reopens += t.reopenCount;
        bucket.qaRejections += t.qaRejectionCount;
        reopenByAssigneeMap.set(key, bucket);
      }

      const insights: string[] = [];
      if (totalTickets > 0) {
        const reworkPct = pct(reopenedTickets.length, totalTickets);
        if (reworkPct > 0) {
          insights.push(
            `${reworkPct}% of sprint tickets were reopened at least once (${reopenedTickets.length} of ${totalTickets}).`
          );
        }
        const repeatOffenders = tickets.filter((t) => t.reopenCount >= 2);
        if (repeatOffenders.length > 0) {
          insights.push(
            `${repeatOffenders.length} ticket${
              repeatOffenders.length === 1 ? "" : "s"
            } reopened 2+ times — likely quality or requirements gap.`
          );
        }
        if (qaRejected.length > 0) {
          insights.push(
            `${totalQaRejections} QA rejection${totalQaRejections === 1 ? "" : "s"} across ${qaRejected.length} ticket${
              qaRejected.length === 1 ? "" : "s"
            } (status reverted from QA → in progress).`
          );
        }
        const oversized = tickets.filter((t) => t.complexityScore >= 30);
        if (oversized.length > 0) {
          insights.push(
            `${oversized.length} high-complexity ticket${oversized.length === 1 ? "" : "s"} (score ≥30) — candidates for breakdown next sprint.`
          );
        }
      }

      res.json({
        success: true,
        data: {
          tickets,
          summary: {
            totalTickets,
            reopenedTicketCount: reopenedTickets.length,
            totalReopens,
            qaRejectedTicketCount: qaRejected.length,
            totalQaRejections,
            reworkPct: pct(reopenedTickets.length, totalTickets),
            highComplexityCount: tickets.filter((t) => t.complexityScore >= 30).length,
          },
          reopenByAssignee: Array.from(reopenByAssigneeMap.values()).sort(
            (a, b) => b.reopens + b.qaRejections - (a.reopens + a.qaRejections)
          ),
          insights,
        },
      } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportController] getSprintQuality error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to build sprint quality analysis",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/sprint-report/:sprintId/hotspots
   * Top epics and tags by activity volume.
   */
  static async getSprintHotspots(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }
      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      if (!(req as any).bypassSnapshot) {
        const snapshot = await SprintReportController._getSnapshotSection(tenantId, sprintId, "hotspots");
        if (snapshot !== undefined) {
          res.json({ success: true, data: snapshot } as ApiResponse);
          return;
        }
      }

      const sprintCheck = await pool.query(
        `SELECT id FROM release_plans WHERE id = $1 AND tenant_id = $2 AND type = 'sprint_plan' LIMIT 1`,
        [sprintId, tenantId]
      );
      if (sprintCheck.rowCount === 0) {
        res.status(404).json({ success: false, error: "Sprint not found" } as ApiResponse);
        return;
      }

      const [epicRows, tagRows, moduleRows] = await Promise.all([
        pool.query(
          `WITH sprint_tix AS (
              SELECT t.id, t.epic_id, t.assignee_id, t.priority, t.story_point, t.status
                FROM tickets t
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                 AND t.epic_id IS NOT NULL
           ),
           log_per_ticket AS (
              SELECT
                tal.ticket_id,
                COUNT(*) FILTER (WHERE tal.action = 'Comment Added')::int AS comments,
                COUNT(*) FILTER (
                  WHERE tal.action = 'Ticket Updated' AND tal.details->>'newStatus' IS NOT NULL
                )::int AS transitions,
                COUNT(*) FILTER (
                  WHERE tal.action = 'Ticket Updated'
                    AND LOWER(tal.details->>'oldStatus') = ANY($3)
                    AND NOT (LOWER(tal.details->>'newStatus') = ANY($3))
                )::int AS reopens
              FROM ticket_activity_log tal
              WHERE tal.tenant_id = $2 AND tal.ticket_id IN (SELECT id FROM sprint_tix)
              GROUP BY tal.ticket_id
           ),
           epic_agg AS (
              SELECT
                st.epic_id,
                COUNT(DISTINCT st.id)::int AS ticket_count,
                COUNT(DISTINCT st.assignee_id) FILTER (WHERE st.assignee_id IS NOT NULL)::int AS unique_assignees,
                COUNT(*) FILTER (
                  WHERE LOWER(COALESCE(st.priority, '')) ~ 'critical|high|p0|p1'
                )::int AS urgent_count,
                COUNT(*) FILTER (WHERE LOWER(st.status) = ANY($4))::int AS done_count,
                COALESCE(SUM(lpt.comments), 0)::int AS total_comments,
                COALESCE(SUM(lpt.transitions), 0)::int AS total_transitions,
                COALESCE(SUM(lpt.reopens), 0)::int AS total_reopens,
                COALESCE(SUM(st.story_point), 0)::int AS total_points
              FROM sprint_tix st
              LEFT JOIN log_per_ticket lpt ON lpt.ticket_id = st.id
              GROUP BY st.epic_id
           )
           SELECT
             ea.epic_id,
             COALESCE(epic.title, 'Untitled epic') AS epic_title,
             epic.ticket_number AS epic_number,
             ea.ticket_count,
             ea.unique_assignees,
             ea.urgent_count,
             ea.done_count,
             ea.total_comments,
             ea.total_transitions,
             ea.total_reopens,
             ea.total_points
           FROM epic_agg ea
           LEFT JOIN tickets epic ON epic.id = ea.epic_id AND epic.tenant_id = $2
           ORDER BY ea.ticket_count DESC, ea.total_transitions DESC
           LIMIT 20`,
          [sprintId, tenantId, DONE_STATUSES, DONE_STATUSES]
        ),
        pool.query(
          `WITH sprint_tix AS (
              SELECT t.id, t.assignee_id, t.priority, t.status,
                     UNNEST(COALESCE(t.tags, ARRAY[]::text[])) AS tag
                FROM tickets t
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
           ),
           log_per_ticket AS (
              SELECT
                tal.ticket_id,
                COUNT(*) FILTER (WHERE tal.action = 'Comment Added')::int AS comments,
                COUNT(*) FILTER (
                  WHERE tal.action = 'Ticket Updated' AND tal.details->>'newStatus' IS NOT NULL
                )::int AS transitions
              FROM ticket_activity_log tal
              WHERE tal.tenant_id = $2 AND tal.ticket_id IN (
                SELECT DISTINCT id FROM sprint_tix
              )
              GROUP BY tal.ticket_id
           )
           SELECT
             st.tag,
             COUNT(DISTINCT st.id)::int AS ticket_count,
             COUNT(DISTINCT st.assignee_id) FILTER (WHERE st.assignee_id IS NOT NULL)::int AS unique_assignees,
             COUNT(*) FILTER (
               WHERE LOWER(COALESCE(st.priority, '')) ~ 'critical|high|p0|p1'
             )::int AS urgent_count,
             COALESCE(SUM(lpt.comments), 0)::int AS total_comments,
             COALESCE(SUM(lpt.transitions), 0)::int AS total_transitions
           FROM sprint_tix st
           LEFT JOIN log_per_ticket lpt ON lpt.ticket_id = st.id
           WHERE st.tag IS NOT NULL AND st.tag <> ''
           GROUP BY st.tag
           ORDER BY ticket_count DESC, total_transitions DESC
           LIMIT 15`,
          [sprintId, tenantId]
        ),
        // Work-type "modules" — always available even without epics/tags.
        pool.query(
          `WITH sprint_tix AS (
              SELECT t.id, t.type, t.assignee_id, t.priority, t.story_point, t.status
                FROM tickets t
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
           ),
           log_per_ticket AS (
              SELECT
                tal.ticket_id,
                COUNT(*) FILTER (WHERE tal.action = 'Comment Added')::int AS comments,
                COUNT(*) FILTER (
                  WHERE tal.action = 'Ticket Updated' AND tal.details->>'newStatus' IS NOT NULL
                )::int AS transitions
              FROM ticket_activity_log tal
              WHERE tal.tenant_id = $2 AND tal.ticket_id IN (SELECT id FROM sprint_tix)
              GROUP BY tal.ticket_id
           )
           SELECT
             COALESCE(NULLIF(TRIM(st.type), ''), 'Unknown') AS module,
             COUNT(DISTINCT st.id)::int AS ticket_count,
             COUNT(DISTINCT st.assignee_id) FILTER (WHERE st.assignee_id IS NOT NULL)::int AS unique_assignees,
             COUNT(*) FILTER (
               WHERE LOWER(COALESCE(st.priority, '')) ~ 'critical|high|p0|p1'
             )::int AS urgent_count,
             COUNT(*) FILTER (WHERE LOWER(st.status) = ANY($3))::int AS done_count,
             COALESCE(SUM(lpt.comments), 0)::int AS total_comments,
             COALESCE(SUM(lpt.transitions), 0)::int AS total_transitions,
             COALESCE(SUM(st.story_point), 0)::int AS total_points
           FROM sprint_tix st
           LEFT JOIN log_per_ticket lpt ON lpt.ticket_id = st.id
           GROUP BY 1
           ORDER BY ticket_count DESC, total_transitions DESC
           LIMIT 15`,
          [sprintId, tenantId, DONE_STATUSES]
        ),
      ]);

      const epics = epicRows.rows.map((r: any) => {
        const ticketCount = Number(r.ticket_count ?? 0);
        const uniqueAssignees = Number(r.unique_assignees ?? 0);
        const urgentCount = Number(r.urgent_count ?? 0);
        const totalComments = Number(r.total_comments ?? 0);
        const totalTransitions = Number(r.total_transitions ?? 0);
        const totalReopens = Number(r.total_reopens ?? 0);
        const score =
          ticketCount * 1 +
          uniqueAssignees * 2 +
          totalComments * 0.5 +
          totalTransitions * 0.3 +
          totalReopens * 5 +
          urgentCount * 4;
        return {
          epicId: r.epic_id,
          epicTitle: r.epic_title,
          epicNumber: r.epic_number,
          ticketCount,
          uniqueAssignees,
          urgentCount,
          doneCount: Number(r.done_count ?? 0),
          totalComments,
          totalTransitions,
          totalReopens,
          totalPoints: Number(r.total_points ?? 0),
          hotScore: Math.round(score * 10) / 10,
        };
      }).sort((a, b) => b.hotScore - a.hotScore);

      const modules = moduleRows.rows
        .map((r: any) => {
          const ticketCount = Number(r.ticket_count ?? 0);
          const uniqueAssignees = Number(r.unique_assignees ?? 0);
          const urgentCount = Number(r.urgent_count ?? 0);
          const totalComments = Number(r.total_comments ?? 0);
          const totalTransitions = Number(r.total_transitions ?? 0);
          const score =
            ticketCount * 1 +
            uniqueAssignees * 2 +
            totalComments * 0.5 +
            totalTransitions * 0.3 +
            urgentCount * 4;
          return {
            module: r.module,
            ticketCount,
            uniqueAssignees,
            urgentCount,
            doneCount: Number(r.done_count ?? 0),
            totalComments,
            totalTransitions,
            totalPoints: Number(r.total_points ?? 0),
            hotScore: Math.round(score * 10) / 10,
          };
        })
        .sort((a, b) => b.hotScore - a.hotScore);

      const tags = tagRows.rows.map((r: any) => {
        const ticketCount = Number(r.ticket_count ?? 0);
        const uniqueAssignees = Number(r.unique_assignees ?? 0);
        const urgentCount = Number(r.urgent_count ?? 0);
        const totalComments = Number(r.total_comments ?? 0);
        const totalTransitions = Number(r.total_transitions ?? 0);
        const score =
          ticketCount * 1 +
          uniqueAssignees * 2 +
          totalComments * 0.5 +
          totalTransitions * 0.3 +
          urgentCount * 4;
        return {
          tag: r.tag,
          ticketCount,
          uniqueAssignees,
          urgentCount,
          totalComments,
          totalTransitions,
          hotScore: Math.round(score * 10) / 10,
        };
      }).sort((a, b) => b.hotScore - a.hotScore);

      const insights: string[] = [];
      const topEpic = epics[0];
      if (topEpic && topEpic.ticketCount >= 3) {
        insights.push(
          `"${topEpic.epicTitle}" was the sprint hotspot — ${topEpic.ticketCount} ticket${
            topEpic.ticketCount === 1 ? "" : "s"
          }, ${topEpic.uniqueAssignees} contributor${
            topEpic.uniqueAssignees === 1 ? "" : "s"
          }${topEpic.totalReopens > 0 ? `, ${topEpic.totalReopens} reopen${topEpic.totalReopens === 1 ? "" : "s"}` : ""}.`
        );
      }
      const urgentEpic = epics.find((e) => e.urgentCount >= 3);
      if (urgentEpic && urgentEpic !== topEpic) {
        insights.push(
          `"${urgentEpic.epicTitle}" carried ${urgentEpic.urgentCount} high/critical tickets — concentrated risk.`
        );
      }
      const reopenEpic = epics.find((e) => e.totalReopens >= 3 && e !== topEpic);
      if (reopenEpic) {
        insights.push(
          `"${reopenEpic.epicTitle}" had ${reopenEpic.totalReopens} reopens — quality concern.`
        );
      }

      // When there are no epics, surface the busiest work type instead so the
      // section is never empty for teams that don't use epics/tags.
      if (epics.length === 0 && modules.length > 0) {
        const topModule = modules[0];
        if (topModule.ticketCount >= 2) {
          insights.push(
            `"${topModule.module}" was the busiest work type — ${topModule.ticketCount} ticket${
              topModule.ticketCount === 1 ? "" : "s"
            }, ${topModule.uniqueAssignees} contributor${
              topModule.uniqueAssignees === 1 ? "" : "s"
            }${topModule.urgentCount > 0 ? `, ${topModule.urgentCount} urgent` : ""}.`
          );
        }
      }

      res.json({
        success: true,
        data: { epics, tags, modules, insights },
      } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportController] getSprintHotspots error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to build sprint hotspots",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/sprint-report/:sprintId/bottlenecks
   * Detects QA queue, blocked work, oversized tickets, single-person dependencies.
   */
  static async getSprintBottlenecks(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }
      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      if (!(req as any).bypassSnapshot) {
        const snapshot = await SprintReportController._getSnapshotSection(tenantId, sprintId, "bottlenecks");
        if (snapshot !== undefined) {
          res.json({ success: true, data: snapshot } as ApiResponse);
          return;
        }
      }

      const sprintCheck = await pool.query(
        `SELECT id FROM release_plans WHERE id = $1 AND tenant_id = $2 AND type = 'sprint_plan' LIMIT 1`,
        [sprintId, tenantId]
      );
      if (sprintCheck.rowCount === 0) {
        res.status(404).json({ success: false, error: "Sprint not found" } as ApiResponse);
        return;
      }

      // Stuck tickets — currently in a non-done status, joined to last-transition timestamp.
      // We compute time-in-current-status by finding latest log where new_status matches current status.
      const stuck = await pool.query(
        `WITH last_transition AS (
            SELECT
              tal.ticket_id,
              MAX(tal.timestamp) AS entered_at
            FROM ticket_activity_log tal
            JOIN tickets t ON t.id = tal.ticket_id
            WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
              AND tal.tenant_id = $2
              AND tal.action = 'Ticket Updated'
              AND LOWER(tal.details->>'newStatus') = LOWER(t.status)
            GROUP BY tal.ticket_id
         )
         SELECT
           t.id, t.ticket_number, t.title, t.status, t.priority, t.story_point,
           t.assignee_id, u.name AS assignee_name,
           lt.entered_at,
           COALESCE(EXTRACT(EPOCH FROM (NOW() - lt.entered_at)) / 86400.0,
                    EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0) AS days_in_status
         FROM tickets t
         LEFT JOIN users u ON u.id = t.assignee_id
         LEFT JOIN last_transition lt ON lt.ticket_id = t.id
         WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
           AND NOT (LOWER(t.status) = ANY($3))
         ORDER BY days_in_status DESC NULLS LAST`,
        [sprintId, tenantId, DONE_STATUSES]
      );

      type StuckRow = {
        ticketId: string;
        ticketNumber: string | null;
        title: string;
        status: string | null;
        priority: string | null;
        storyPoint: number | null;
        assigneeId: string | null;
        assigneeName: string | null;
        daysInStatus: number;
      };

      const stuckTickets: StuckRow[] = stuck.rows.map((r: any) => ({
        ticketId: r.id,
        ticketNumber: r.ticket_number,
        title: r.title,
        status: (r.status ?? "").toString(),
        priority: r.priority,
        storyPoint: r.story_point,
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        daysInStatus: r.days_in_status == null ? 0 : Math.round(Number(r.days_in_status) * 10) / 10,
      }));

      const QA_SET = new Set(QA_STATUSES);
      const BLOCKED_SET = new Set(BLOCKED_STATUSES);

      const qaQueue = stuckTickets.filter((t) => QA_SET.has(t.status.toLowerCase()));
      const blocked = stuckTickets.filter((t) => BLOCKED_SET.has(t.status.toLowerCase()));
      const stuckInProgress = stuckTickets
        .filter(
          (t) =>
            !QA_SET.has(t.status.toLowerCase()) &&
            !BLOCKED_SET.has(t.status.toLowerCase()) &&
            t.daysInStatus >= 3
        )
        .slice(0, 20);

      // Oversized in-flight tickets
      const oversized = await pool.query(
        `SELECT t.id, t.ticket_number, t.title, t.status, t.story_point, t.assignee_id,
                u.name AS assignee_name
           FROM tickets t
           LEFT JOIN users u ON u.id = t.assignee_id
          WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
            AND NOT (LOWER(t.status) = ANY($3))
            AND t.story_point IS NOT NULL AND t.story_point >= 13
          ORDER BY t.story_point DESC`,
        [sprintId, tenantId, DONE_STATUSES]
      );

      // Single-person dependency: % of in-flight work concentrated on each user
      const inFlight = await pool.query(
        `SELECT t.assignee_id, COALESCE(u.name, 'Unassigned') AS assignee_name,
                COUNT(*)::int AS in_flight_count
           FROM tickets t
           LEFT JOIN users u ON u.id = t.assignee_id
          WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
            AND NOT (LOWER(t.status) = ANY($3))
          GROUP BY t.assignee_id, u.name
          ORDER BY in_flight_count DESC`,
        [sprintId, tenantId, DONE_STATUSES]
      );

      const inFlightRows = inFlight.rows.map((r: any) => ({
        assigneeId: r.assignee_id,
        assigneeName: r.assignee_name,
        inFlightCount: Number(r.in_flight_count ?? 0),
      }));
      const inFlightTotal = inFlightRows.reduce((s: number, r: any) => s + r.inFlightCount, 0);
      const concentrationCandidates = inFlightRows
        .filter((r: any) => r.assigneeId)
        .map((r: any) => ({
          ...r,
          sharePct: pct(r.inFlightCount, inFlightTotal),
        }))
        .filter((r: any) => r.sharePct >= 30)
        .sort((a: any, b: any) => b.sharePct - a.sharePct);

      const QA_THRESHOLD_DAYS = 2;
      const STUCK_THRESHOLD_DAYS = 3;
      const longQa = qaQueue.filter((t) => t.daysInStatus >= QA_THRESHOLD_DAYS);

      const alerts: { kind: string; severity: "info" | "warn" | "critical"; message: string }[] =
        [];
      if (longQa.length >= 5) {
        alerts.push({
          kind: "qa-queue",
          severity: "critical",
          message: `QA queue is jammed — ${longQa.length} tickets sitting ≥${QA_THRESHOLD_DAYS}d.`,
        });
      } else if (longQa.length >= 2) {
        alerts.push({
          kind: "qa-queue",
          severity: "warn",
          message: `${longQa.length} tickets in QA for ≥${QA_THRESHOLD_DAYS}d — review queue.`,
        });
      }
      if (blocked.length >= 1) {
        alerts.push({
          kind: "blocked",
          severity: blocked.length >= 3 ? "critical" : "warn",
          message: `${blocked.length} blocked ticket${blocked.length === 1 ? "" : "s"} in sprint.`,
        });
      }
      if (stuckInProgress.length > 0) {
        alerts.push({
          kind: "stuck-wip",
          severity: stuckInProgress.length >= 5 ? "warn" : "info",
          message: `${stuckInProgress.length} ticket${
            stuckInProgress.length === 1 ? "" : "s"
          } in progress with no status change for ≥${STUCK_THRESHOLD_DAYS}d.`,
        });
      }
      if (oversized.rowCount && oversized.rowCount > 0) {
        alerts.push({
          kind: "oversized",
          severity: oversized.rowCount >= 3 ? "warn" : "info",
          message: `${oversized.rowCount} oversized ticket${
            oversized.rowCount === 1 ? "" : "s"
          } (≥13 pts) still in flight.`,
        });
      }
      if (concentrationCandidates.length > 0) {
        const top = concentrationCandidates[0];
        alerts.push({
          kind: "single-person",
          severity: top.sharePct >= 50 ? "critical" : "warn",
          message: `${top.assigneeName} holds ${top.sharePct}% of in-flight work — single-person dependency.`,
        });
      }

      res.json({
        success: true,
        data: {
          alerts,
          qaQueue,
          blocked,
          stuckInProgress,
          oversized: oversized.rows.map((r: any) => ({
            ticketId: r.id,
            ticketNumber: r.ticket_number,
            title: r.title,
            status: r.status,
            storyPoint: Number(r.story_point ?? 0),
            assigneeId: r.assignee_id,
            assigneeName: r.assignee_name,
          })),
          concentration: concentrationCandidates,
          thresholds: {
            qaDays: QA_THRESHOLD_DAYS,
            stuckDays: STUCK_THRESHOLD_DAYS,
          },
        },
      } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportController] getSprintBottlenecks error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to build sprint bottlenecks",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/sprint-report/:sprintId/ai-narrative
   * Returns the cached AI narrative for this sprint, or { cached: false } if none exists.
   */
  static async getAiNarrative(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }
      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      const cached = await pool.query(
        `SELECT narrative, predictions, model, generated_by_id, generated_at
           FROM sprint_report_ai_narratives
          WHERE tenant_id = $1 AND sprint_id = $2
          LIMIT 1`,
        [tenantId, sprintId]
      );

      if (cached.rowCount === 0) {
        res.json({
          success: true,
          data: {
            cached: false,
            aiAvailable: SprintReportAiService.isAvailable(),
            narrative: null,
            generatedAt: null,
          },
        } as ApiResponse);
        return;
      }

      const row = cached.rows[0];
      res.json({
        success: true,
        data: {
          cached: true,
          aiAvailable: SprintReportAiService.isAvailable(),
          narrative: row.narrative as AiNarrative,
          model: row.model,
          generatedAt: row.generated_at,
          generatedById: row.generated_by_id,
        },
      } as ApiResponse);
    } catch (err: any) {
      console.error("[SprintReportController] getAiNarrative error:", err);
      const isMissingTable =
        err?.code === "42P01" ||
        /relation .* does not exist/i.test(err?.message ?? "");
      res.status(500).json({
        success: false,
        error: isMissingTable
          ? "AI narrative cache table is missing. Run scripts/run_sprint_report_ai_migration.js."
          : err?.message ?? "Failed to load AI narrative",
      } as ApiResponse);
    }
  }

  /**
   * POST /api/sprint-report/:sprintId/ai-narrative
   * Generates a fresh AI narrative, caches it, returns it.
   */
  static async postAiNarrative(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }
      if (!SprintReportAiService.isAvailable()) {
        res.status(503).json({
          success: false,
          error: "AI service unavailable. GEMINI_API_KEY is not configured.",
        } as ApiResponse);
        return;
      }

      const { sprintId } = req.params;
      const tenantId = req.tenantId;

      const context = await SprintReportController._buildAiContext(sprintId, tenantId);
      if (!context) {
        res.status(404).json({ success: false, error: "Sprint not found" } as ApiResponse);
        return;
      }

      const narrative = await SprintReportAiService.generateNarrative(context, req.tenantId);
      const predictions = SprintReportAiService.buildPredictions(context);

      await pool.query(
        `INSERT INTO sprint_report_ai_narratives
           (tenant_id, sprint_id, narrative, predictions, model, generated_by_id, generated_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, NOW())
         ON CONFLICT (tenant_id, sprint_id) DO UPDATE SET
           narrative = EXCLUDED.narrative,
           predictions = EXCLUDED.predictions,
           model = EXCLUDED.model,
           generated_by_id = EXCLUDED.generated_by_id,
           generated_at = NOW()`,
        [
          tenantId,
          sprintId,
          JSON.stringify(narrative),
          JSON.stringify(predictions),
          "gemini-flash-latest",
          req.user.id,
        ]
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.SPRINTS,
        page: Page.SPRINT_REPORT,
        action: Action.GENERATE_AI,
        actionLabel: "AI narrative generated",
        entityType: EntityType.SPRINT_AI_NARRATIVE,
        entityId: sprintId,
        parentEntityType: EntityType.RELEASE_PLAN,
        parentEntityId: sprintId,
        statusCode: 200,
        metadata: { model: "gemini-flash-latest" },
      });

      res.json({
        success: true,
        data: {
          cached: false,
          aiAvailable: true,
          narrative,
          model: "gemini-flash-latest",
          generatedAt: new Date().toISOString(),
          generatedById: req.user.id,
        },
      } as ApiResponse);
    } catch (err: any) {
      console.error("[SprintReportController] postAiNarrative error:", err);
      res.status(500).json({
        success: false,
        error: err?.message ?? "Failed to generate AI narrative",
      } as ApiResponse);
    }
  }

  /**
   * Builds the compressed signal payload that gets fed into the LLM.
   * Returns null if the sprint doesn't exist for this tenant.
   */
  private static async _buildAiContext(
    sprintId: string,
    tenantId: string
  ): Promise<SprintAiContext | null> {
    const sprintRes = await pool.query<SprintRow>(
      `SELECT id, version, goal, status, start_date, end_date, started_at, completed_at,
              committed_points, completed_points, project_id, NULL AS project_name, NULL AS project_code
         FROM release_plans
        WHERE id = $1 AND tenant_id = $2 AND type = 'sprint_plan'
        LIMIT 1`,
      [sprintId, tenantId]
    );
    if (sprintRes.rowCount === 0) return null;
    const sprint = sprintRes.rows[0];
    const startAnchor = sprint.started_at ?? sprint.start_date;
    const endAnchor = sprint.completed_at ?? sprint.end_date;
    const now = new Date();
    const daysElapsed = startAnchor ? daysBetween(startAnchor, now) : null;
    const durationDays = daysBetween(startAnchor, endAnchor);
    const daysRemaining =
      durationDays != null && daysElapsed != null
        ? Math.max(0, durationDays - daysElapsed)
        : null;

    const [aggRes, scopeRes, scopeAddersRes, velocityRes, timelineRes, bottlenecksRes, hotspotsRes, qualityRes, topContribRes, idleRes] =
      await Promise.all([
        // 1: high-level aggregates
        pool.query(
          `SELECT
              COUNT(*)::int AS total_tickets,
              COUNT(*) FILTER (WHERE LOWER(status) = ANY($3))::int AS done_tickets,
              COUNT(*) FILTER (WHERE LOWER(status) = ANY($4))::int AS qa_tickets,
              COUNT(*) FILTER (WHERE LOWER(status) = ANY($5))::int AS blocked_tickets,
              COALESCE(SUM(story_point), 0)::int AS planned_points,
              COALESCE(SUM(story_point) FILTER (WHERE LOWER(status) = ANY($3)), 0)::int AS done_points,
              COUNT(DISTINCT assignee_id) FILTER (WHERE assignee_id IS NOT NULL)::int AS team_size,
              COUNT(*) FILTER (WHERE LOWER(type) = 'bug')::int AS bug_count,
              COUNT(*) FILTER (WHERE LOWER(type) IS DISTINCT FROM 'bug')::int AS feature_count
            FROM tickets
            WHERE sprint_plan_id = $1 AND tenant_id = $2 AND is_deleted = false`,
          [sprintId, tenantId, DONE_STATUSES, QA_STATUSES, BLOCKED_STATUSES]
        ),
        // 2: scope split
        pool.query(
          `WITH ct AS (
              SELECT id, story_point, created_at, type FROM tickets
              WHERE sprint_plan_id = $1 AND tenant_id = $2 AND is_deleted = false
           ),
           ma AS (
              SELECT DISTINCT ticket_id FROM sprint_completion_logs
              WHERE sprint_plan_id = $1 AND tenant_id = $2 AND action = 'moved_to_sprint'
                AND ($3::timestamp IS NULL OR performed_at > $3::timestamp)
           )
           SELECT
             COUNT(*) FILTER (
               WHERE ma.ticket_id IS NOT NULL
                  OR ($3::timestamp IS NOT NULL AND ct.created_at > $3::timestamp)
             )::int AS added_tickets,
             COUNT(*) FILTER (
               WHERE ma.ticket_id IS NULL
                 AND ($3::timestamp IS NULL OR ct.created_at <= $3::timestamp)
             )::int AS planned_tickets,
             COALESCE(SUM(ct.story_point) FILTER (
               WHERE ma.ticket_id IS NOT NULL
                  OR ($3::timestamp IS NOT NULL AND ct.created_at > $3::timestamp)
             ), 0)::int AS added_points,
             COALESCE(SUM(ct.story_point) FILTER (
               WHERE ma.ticket_id IS NULL
                 AND ($3::timestamp IS NULL OR ct.created_at <= $3::timestamp)
             ), 0)::int AS planned_points
           FROM ct LEFT JOIN ma ON ma.ticket_id = ct.id`,
          [sprintId, tenantId, startAnchor]
        ),
        // 3: top scope adders (mid-sprint)
        pool.query(
          `WITH ma AS (
              SELECT DISTINCT ON (ticket_id) ticket_id, performed_by_id, performed_at
                FROM sprint_completion_logs
               WHERE sprint_plan_id = $1 AND tenant_id = $2 AND action = 'moved_to_sprint'
                 AND ($3::timestamp IS NULL OR performed_at > $3::timestamp)
               ORDER BY ticket_id, performed_at
           )
           SELECT COALESCE(u.name, 'Unknown') AS name, COUNT(*)::int AS tickets
             FROM ma
             LEFT JOIN users u ON u.id = ma.performed_by_id
            GROUP BY u.name
            ORDER BY tickets DESC
            LIMIT 5`,
          [sprintId, tenantId, startAnchor]
        ),
        // 4: velocity day signals
        pool.query(
          `WITH sprint_window AS (
              SELECT $3::date AS sprint_start, LEAST($4::date, CURRENT_DATE) AS sprint_end
           ),
           days AS (
              SELECT generate_series(
                       (SELECT sprint_start FROM sprint_window),
                       (SELECT sprint_end FROM sprint_window),
                       '1 day'::interval
                     )::date AS day
           ),
           completions AS (
              SELECT
                (tal.timestamp AT TIME ZONE 'UTC')::date AS day,
                t.story_point
              FROM ticket_activity_log tal
              JOIN tickets t ON t.id = tal.ticket_id
              WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                AND tal.tenant_id = $2
                AND tal.action = 'Ticket Updated'
                AND LOWER(tal.details->>'newStatus') = ANY($5)
                AND (
                  tal.details->>'oldStatus' IS NULL
                  OR NOT (LOWER(tal.details->>'oldStatus') = ANY($5))
                )
           ),
           daily AS (
              SELECT day, COUNT(*)::int AS tickets, COALESCE(SUM(story_point), 0)::int AS points
                FROM completions GROUP BY day
           )
           SELECT d.day, COALESCE(da.tickets, 0) AS tickets, COALESCE(da.points, 0) AS points
             FROM days d LEFT JOIN daily da ON da.day = d.day
            ORDER BY d.day`,
          [sprintId, tenantId, startAnchor, endAnchor ?? now, DONE_STATUSES]
        ),
        // 5: timeline aggregates
        pool.query(
          `WITH se AS (
              SELECT tal.ticket_id,
                     LOWER(tal.details->>'newStatus') AS new_status,
                     LOWER(tal.details->>'oldStatus') AS old_status
                FROM ticket_activity_log tal
                JOIN tickets t ON t.id = tal.ticket_id
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                 AND tal.tenant_id = $2 AND tal.action = 'Ticket Updated'
                 AND tal.details->>'newStatus' IS NOT NULL
           ),
           per AS (
              SELECT ticket_id,
                     COUNT(*)::int AS transitions,
                     COUNT(*) FILTER (
                       WHERE old_status = ANY($3) AND NOT (new_status = ANY($3))
                     )::int AS reopens
                FROM se GROUP BY ticket_id
           ),
           t_delay AS (
              SELECT t.id, t.type, t.assignee_id, COALESCE(u.name, 'Unassigned') AS assignee_name,
                     CASE
                       WHEN t.due_date IS NOT NULL THEN
                         GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(t.completed_at, NOW()) - t.due_date)) / 86400.0)
                       ELSE NULL
                     END AS delay_days,
                     COALESCE(p.transitions, 0) AS transitions,
                     COALESCE(p.reopens, 0) AS reopens
                FROM tickets t
                LEFT JOIN users u ON u.id = t.assignee_id
                LEFT JOIN per p ON p.ticket_id = t.id
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
           )
           SELECT
             COUNT(*) FILTER (WHERE delay_days > 0)::int AS delayed_count,
             AVG(delay_days) FILTER (WHERE delay_days > 0) AS avg_delay,
             MAX(delay_days) AS max_delay,
             COALESCE(SUM(reopens), 0)::int AS total_reopens,
             COUNT(*) FILTER (WHERE transitions >= 8 OR reopens >= 2)::int AS high_complexity_count,
             json_agg(json_build_object('name', assignee_name, 'delay', delay_days)
                      ORDER BY delay_days DESC NULLS LAST)
                FILTER (WHERE delay_days > 0) AS top_delays,
             json_agg(json_build_object('type', type, 'delay', delay_days)
                      ORDER BY delay_days DESC NULLS LAST)
                FILTER (WHERE delay_days > 0) AS top_type_delays
           FROM t_delay`,
          [sprintId, tenantId, DONE_STATUSES]
        ),
        // 6: bottleneck counts + concentration
        pool.query(
          `WITH last_t AS (
              SELECT tal.ticket_id, MAX(tal.timestamp) AS entered_at
                FROM ticket_activity_log tal
                JOIN tickets t ON t.id = tal.ticket_id
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                 AND tal.tenant_id = $2 AND tal.action = 'Ticket Updated'
                 AND LOWER(tal.details->>'newStatus') = LOWER(t.status)
               GROUP BY tal.ticket_id
           ),
           stuck AS (
              SELECT t.id, t.status, t.story_point, t.assignee_id, u.name AS assignee_name,
                     COALESCE(EXTRACT(EPOCH FROM (NOW() - lt.entered_at)) / 86400.0,
                              EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400.0) AS days
                FROM tickets t
                LEFT JOIN users u ON u.id = t.assignee_id
                LEFT JOIN last_t lt ON lt.ticket_id = t.id
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                 AND NOT (LOWER(t.status) = ANY($3))
           ),
           inflight AS (
              SELECT COALESCE(u.name, 'Unassigned') AS name, COUNT(*)::int AS cnt
                FROM tickets t
                LEFT JOIN users u ON u.id = t.assignee_id
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                 AND NOT (LOWER(t.status) = ANY($3))
                 AND t.assignee_id IS NOT NULL
               GROUP BY u.name
           )
           SELECT
             (SELECT COUNT(*)::int FROM stuck WHERE LOWER(status) = ANY($4) AND days >= 2) AS qa_queue,
             (SELECT COUNT(*)::int FROM stuck WHERE LOWER(status) = ANY($5)) AS blocked,
             (SELECT COUNT(*)::int FROM stuck WHERE NOT (LOWER(status) = ANY($4)) AND NOT (LOWER(status) = ANY($5)) AND days >= 3) AS stuck_in_progress,
             (SELECT COUNT(*)::int FROM stuck WHERE story_point >= 13) AS oversized,
             (SELECT COUNT(*)::int FROM stuck) AS total_inflight,
             (SELECT json_agg(json_build_object('name', name, 'cnt', cnt) ORDER BY cnt DESC) FROM inflight) AS inflight_breakdown`,
          [sprintId, tenantId, DONE_STATUSES, QA_STATUSES, BLOCKED_STATUSES]
        ),
        // 7: hot epics + tags top 5
        pool.query(
          `WITH sprint_tix AS (
              SELECT t.id, t.epic_id, t.assignee_id, t.priority, t.story_point, t.status
                FROM tickets t
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                 AND t.epic_id IS NOT NULL
           ),
           lp AS (
              SELECT tal.ticket_id,
                     COUNT(*) FILTER (
                       WHERE tal.action = 'Ticket Updated'
                         AND LOWER(tal.details->>'oldStatus') = ANY($3)
                         AND NOT (LOWER(tal.details->>'newStatus') = ANY($3))
                     )::int AS reopens
                FROM ticket_activity_log tal
               WHERE tal.tenant_id = $2 AND tal.ticket_id IN (SELECT id FROM sprint_tix)
               GROUP BY tal.ticket_id
           ),
           epic_agg AS (
              SELECT st.epic_id,
                     COUNT(DISTINCT st.id)::int AS tickets,
                     COUNT(DISTINCT st.assignee_id) FILTER (WHERE st.assignee_id IS NOT NULL)::int AS assignees,
                     COUNT(*) FILTER (WHERE LOWER(COALESCE(st.priority,'')) ~ 'critical|high|p0|p1')::int AS urgent,
                     COALESCE(SUM(lp.reopens), 0)::int AS reopens
                FROM sprint_tix st
                LEFT JOIN lp ON lp.ticket_id = st.id
               GROUP BY st.epic_id
           ),
           top_epics AS (
              SELECT COALESCE(epic.title, 'Untitled epic') AS title,
                     ea.tickets, ea.assignees, ea.urgent, ea.reopens
                FROM epic_agg ea
                LEFT JOIN tickets epic ON epic.id = ea.epic_id AND epic.tenant_id = $2
               ORDER BY ea.tickets DESC
               LIMIT 5
           ),
           tag_explode AS (
              SELECT UNNEST(COALESCE(t.tags, ARRAY[]::text[])) AS tag,
                     t.id, t.priority
                FROM tickets t
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
           ),
           tag_agg AS (
              SELECT tag,
                     COUNT(DISTINCT id)::int AS tickets,
                     COUNT(*) FILTER (WHERE LOWER(COALESCE(priority,'')) ~ 'critical|high|p0|p1')::int AS urgent
                FROM tag_explode
               WHERE tag IS NOT NULL AND tag <> ''
               GROUP BY tag
               ORDER BY tickets DESC
               LIMIT 5
           )
           SELECT
             (SELECT json_agg(top_epics) FROM top_epics) AS top_epics,
             (SELECT json_agg(tag_agg) FROM tag_agg) AS top_tags`,
          [sprintId, tenantId, DONE_STATUSES]
        ),
        // 8: quality (rework)
        pool.query(
          `WITH per AS (
              SELECT tal.ticket_id,
                     COUNT(*) FILTER (
                       WHERE tal.action = 'Ticket Updated'
                         AND LOWER(tal.details->>'oldStatus') = ANY($3)
                         AND NOT (LOWER(tal.details->>'newStatus') = ANY($3))
                     )::int AS reopens,
                     COUNT(*) FILTER (
                       WHERE tal.action = 'Ticket Updated'
                         AND LOWER(tal.details->>'oldStatus') = ANY($4)
                         AND LOWER(tal.details->>'newStatus') = 'in_progress'
                     )::int AS qa_rejections
                FROM ticket_activity_log tal
                JOIN tickets t ON t.id = tal.ticket_id
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                 AND tal.tenant_id = $2
               GROUP BY tal.ticket_id
           )
           SELECT
             COUNT(*) FILTER (WHERE reopens > 0)::int AS reopened_count,
             COUNT(*) FILTER (WHERE qa_rejections > 0)::int AS qa_rejected_count,
             COALESCE(SUM(reopens), 0)::int AS total_reopens,
             COALESCE(SUM(qa_rejections), 0)::int AS total_qa_rejections
           FROM per`,
          [sprintId, tenantId, DONE_STATUSES, QA_STATUSES]
        ),
        // 9: top contributors
        pool.query(
          `SELECT COALESCE(u.name, 'Unassigned') AS name,
                  COALESCE(SUM(t.story_point) FILTER (WHERE LOWER(t.status) = ANY($3)), 0)::int AS points,
                  COUNT(*) FILTER (WHERE LOWER(t.status) = ANY($3))::int AS tickets,
                  COUNT(*) FILTER (WHERE LOWER(t.type) = 'bug' AND LOWER(t.status) = ANY($3))::int AS bugs_fixed
             FROM tickets t
             LEFT JOIN users u ON u.id = t.assignee_id
            WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
              AND t.assignee_id IS NOT NULL
            GROUP BY u.name
            ORDER BY tickets DESC, points DESC
            LIMIT 5`,
          [sprintId, tenantId, DONE_STATUSES]
        ),
        // 10: idle contributor count
        pool.query(
          `SELECT COUNT(*)::int AS idle FROM (
              SELECT t.assignee_id
                FROM tickets t
               WHERE t.sprint_plan_id = $1 AND t.tenant_id = $2 AND t.is_deleted = false
                 AND t.assignee_id IS NOT NULL
               GROUP BY t.assignee_id
              HAVING COUNT(*) FILTER (WHERE LOWER(t.status) = ANY($3)) = 0
           ) sub`,
          [sprintId, tenantId, DONE_STATUSES]
        ),
      ]);

    const agg = aggRes.rows[0] ?? {};
    const totalTickets = Number(agg.total_tickets ?? 0);
    const doneTickets = Number(agg.done_tickets ?? 0);
    const plannedPoints = Number(agg.planned_points ?? 0);
    const donePoints = Number(agg.done_points ?? 0);
    const blockedTickets = Number(agg.blocked_tickets ?? 0);
    const completionPct = pct(doneTickets, totalTickets);
    const pointCompletionPct = pct(donePoints, plannedPoints);
    const spilloverPct = pct(totalTickets - doneTickets, totalTickets);

    const scope = scopeRes.rows[0] ?? {};
    const addedTickets = Number(scope.added_tickets ?? 0);
    const plannedScopeTickets = Number(scope.planned_tickets ?? 0);
    const addedPoints = Number(scope.added_points ?? 0);
    const plannedScopePoints = Number(scope.planned_points ?? 0);

    const removedRes = await pool.query(
      `SELECT COUNT(*)::int AS removed FROM sprint_completion_logs
        WHERE sprint_plan_id = $1 AND tenant_id = $2
          AND action IN ('moved_to_bucket','moved_to_backlog','moved_to_trash')
          AND ($3::timestamp IS NULL OR performed_at > $3::timestamp)
          AND ($4::timestamp IS NULL OR performed_at <= $4::timestamp)`,
      [sprintId, tenantId, startAnchor, endAnchor]
    );
    const removedTickets = Number(removedRes.rows[0]?.removed ?? 0);

    const days: { day: string; tickets: number; points: number }[] = velocityRes.rows.map(
      (r: any) => ({ day: r.day, tickets: Number(r.tickets ?? 0), points: Number(r.points ?? 0) })
    );
    const daysTotal = days.length;
    const daysWithCompletions = days.filter((d) => d.tickets > 0).length;
    const totalVelocityTickets = days.reduce((s, d) => s + d.tickets, 0);
    const finalRushPct =
      totalVelocityTickets > 0 && daysTotal >= 2
        ? Math.round(
            (days.slice(-2).reduce((s, d) => s + d.tickets, 0) / totalVelocityTickets) * 100
          )
        : 0;
    const midStart = Math.floor(daysTotal / 3);
    const midEnd = Math.floor((daysTotal * 2) / 3);
    const midSlice = days.slice(midStart, midEnd);
    const midSlackPct =
      totalVelocityTickets > 0 && midSlice.length >= 2
        ? Math.round(
            (midSlice.reduce((s, d) => s + d.tickets, 0) / totalVelocityTickets) * 100
          )
        : 0;
    const pointsPerDayAvg =
      daysTotal > 0 ? days.reduce((s, d) => s + d.points, 0) / daysTotal : 0;

    const timeline = timelineRes.rows[0] ?? {};
    const topDelays: { name: string; delay: number }[] = Array.isArray(timeline.top_delays)
      ? timeline.top_delays
      : [];
    const topTypeDelays: { type: string; delay: number }[] = Array.isArray(timeline.top_type_delays)
      ? timeline.top_type_delays
      : [];

    const delayByName = new Map<string, { total: number; count: number }>();
    for (const d of topDelays) {
      const name = d.name ?? "Unassigned";
      const cur = delayByName.get(name) ?? { total: 0, count: 0 };
      cur.total += Number(d.delay ?? 0);
      cur.count += 1;
      delayByName.set(name, cur);
    }
    const delayByAssigneeTop = Array.from(delayByName.entries())
      .map(([name, v]) => ({ name, avgDelay: Math.round((v.total / v.count) * 10) / 10, count: v.count }))
      .sort((a, b) => b.avgDelay - a.avgDelay)
      .slice(0, 3);

    const delayByType = new Map<string, { total: number; count: number }>();
    for (const d of topTypeDelays) {
      const type = d.type ?? "Unknown";
      const cur = delayByType.get(type) ?? { total: 0, count: 0 };
      cur.total += Number(d.delay ?? 0);
      cur.count += 1;
      delayByType.set(type, cur);
    }
    const delayByTypeTop = Array.from(delayByType.entries())
      .map(([type, v]) => ({ type, avgDelay: Math.round((v.total / v.count) * 10) / 10, count: v.count }))
      .sort((a, b) => b.avgDelay - a.avgDelay)
      .slice(0, 3);

    const bn = bottlenecksRes.rows[0] ?? {};
    const inflightBreakdown: { name: string; cnt: number }[] = Array.isArray(bn.inflight_breakdown)
      ? bn.inflight_breakdown
      : [];
    const totalInflight = Number(bn.total_inflight ?? 0);
    const concentration = inflightBreakdown
      .filter((r) => r.name !== "Unassigned")
      .map((r) => ({ name: r.name, sharePct: pct(r.cnt, totalInflight) }))
      .filter((r) => r.sharePct >= 30)
      .sort((a, b) => b.sharePct - a.sharePct)
      .slice(0, 3);

    const hot = hotspotsRes.rows[0] ?? {};
    const topEpics: { title: string; tickets: number; assignees: number; urgent: number; reopens: number }[] =
      Array.isArray(hot.top_epics) ? hot.top_epics : [];
    const topTags: { tag: string; tickets: number; urgent: number }[] = Array.isArray(hot.top_tags)
      ? hot.top_tags
      : [];

    const quality = qualityRes.rows[0] ?? {};
    const reopenedCount = Number(quality.reopened_count ?? 0);
    const qaRejectedCount = Number(quality.qa_rejected_count ?? 0);
    const totalReopensQ = Number(quality.total_reopens ?? 0);
    const totalQaRejections = Number(quality.total_qa_rejections ?? 0);

    const topContributors = topContribRes.rows.map((r: any) => ({
      name: r.name,
      points: Number(r.points ?? 0),
      tickets: Number(r.tickets ?? 0),
      bugsFixed: Number(r.bugs_fixed ?? 0),
    }));
    const idleContributors = Number(idleRes.rows[0]?.idle ?? 0);

    const scopeIncreasePct = pct(addedTickets, plannedScopeTickets || 1);
    const capacityDisruptionPct = pct(addedPoints, plannedScopePoints || 1);
    const addedAfterStartPct = pct(addedTickets, totalTickets);

    const health = computeHealthScore({
      completionPct,
      spilloverPct,
      addedAfterStartPct,
      blockedCount: blockedTickets,
      totalTickets,
    });

    const ctx: SprintAiContext = {
      sprintName: sprint.version,
      goal: sprint.goal,
      status: sprint.status,
      startDate: startAnchor ? new Date(startAnchor).toISOString() : null,
      endDate: endAnchor ? new Date(endAnchor).toISOString() : null,
      durationDays,
      daysElapsed,
      daysRemaining,
      teamSize: Number(agg.team_size ?? 0),
      totalTickets,
      completionPct,
      pointCompletionPct,
      spilloverPct,
      addedAfterStartPct,
      bugCount: Number(agg.bug_count ?? 0),
      featureCount: Number(agg.feature_count ?? 0),
      blockedTickets,
      qaTickets: Number(agg.qa_tickets ?? 0),
      plannedPoints,
      completedPoints: donePoints,
      healthScore: health.score,
      healthBand: health.band,
      topContributors,
      idleContributors,
      scope: {
        plannedTickets: plannedScopeTickets,
        addedTickets,
        removedTickets,
        scopeIncreasePct,
        capacityDisruptionPct,
        topAdders: scopeAddersRes.rows.map((r: any) => ({
          name: r.name,
          tickets: Number(r.tickets ?? 0),
        })),
      },
      velocity: {
        daysWithCompletions,
        daysTotal,
        finalRushPct,
        midSlackPct,
        pointsPerDayAvg: Math.round(pointsPerDayAvg * 10) / 10,
      },
      timeline: {
        delayedCount: Number(timeline.delayed_count ?? 0),
        avgDelayDays:
          timeline.avg_delay == null
            ? 0
            : Math.round(Number(timeline.avg_delay) * 10) / 10,
        longestDelayDays:
          timeline.max_delay == null ? null : Math.round(Number(timeline.max_delay) * 10) / 10,
        delayByAssigneeTop,
        delayByTypeTop,
        totalReopens: Number(timeline.total_reopens ?? 0),
        highComplexityCount: Number(timeline.high_complexity_count ?? 0),
      },
      bottlenecks: {
        qaQueueCount: Number(bn.qa_queue ?? 0),
        blockedCount: Number(bn.blocked ?? 0),
        stuckInProgressCount: Number(bn.stuck_in_progress ?? 0),
        oversizedCount: Number(bn.oversized ?? 0),
        concentration,
      },
      hotspots: {
        topEpics,
        topTags,
      },
      quality: {
        reworkPct: pct(reopenedCount, totalTickets),
        totalReopens: totalReopensQ,
        qaRejectedTicketCount: qaRejectedCount,
        totalQaRejections,
        highComplexityCount: Number(timeline.high_complexity_count ?? 0),
      },
    };

    return ctx;
  }

  /**
   * POST /api/sprint-report/:sprintId/export-pdf
   * Generates a PDF of the Sprint Report using Puppeteer and streams it back.
   */
  static async exportSprintReportPdf(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const sprintId = req.params.sprintId;
      const { htmlPayload } = req.body;

      if (!htmlPayload) {
        res.status(400).json({
          success: false,
          error: "htmlPayload is required",
        } as ApiResponse);
        return;
      }

      // Generate the PDF buffer directly in memory
      const pdfBuffer = await SprintReportExportService.generatePDFBuffer(htmlPayload);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Sprint-Report-${sprintId}.pdf"`
      );

      res.send(pdfBuffer);

    } catch (error) {
      console.error("Error generating Sprint Report PDF:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate PDF",
      } as ApiResponse);
    }
  }
}
