import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";
import { generateSprintReportSnapshot } from "@/services/sprintReportSnapshotService";

/**
 * Sprint Reports v2 — list / detail / generate of stored report snapshots.
 *
 * The right-hand panel of the reports workspace lists every completed sprint in
 * a project alongside its generated report (if any). Reports are generated
 * automatically when a sprint completes, and can be generated on demand here for
 * sprints completed before this feature existed.
 */
export class SprintReportsController {
  /**
   * GET /api/sprint-reports?projectId=...
   * Lists completed sprints for a project with their report summary + `hasReport`.
   */
  static async listProjectReports(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const projectId = (req.query.projectId as string) || "";
      const { page, limit, search } = req.query;

      if (!projectId) {
        res.status(400).json({
          success: false,
          error: "projectId query parameter is required",
        } as ApiResponse);
        return;
      }

      const tenantId = req.tenantId;

      const joinedSql = `
        SELECT rp.id AS sprint_id,
               rp.version AS sprint_name,
               rp.goal AS sprint_goal,
               rp.status,
               rp.started_at,
               rp.completed_at,
               rp.committed_points,
               rp.completed_points,
               sr.health_score,
               sr.health_band,
               sr.completion_pct,
               sr.total_tickets,
               sr.completed_tickets,
               sr.generated_at,
               sr.generated_by_id,
               u.name AS generated_by_name,
               (sr.sprint_id IS NOT NULL) AS has_report
          FROM release_plans rp
          LEFT JOIN sprint_reports sr
            ON sr.tenant_id = rp.tenant_id AND sr.sprint_id = rp.id
          LEFT JOIN users u ON u.id = sr.generated_by_id
         WHERE rp.tenant_id = $1
           AND rp.project_id = $2
           AND rp.type = 'sprint_plan'
           AND rp.status = 'completed'
         ORDER BY COALESCE(sr.generated_at, rp.completed_at, rp.updated_at) DESC`;

      let rows: any[];
      try {
        const result = await pool.query(joinedSql, [tenantId, projectId]);
        rows = result.rows;
      } catch (err: any) {
        // sprint_reports table not migrated yet → fall back to listing sprints only.
        const isMissingTable =
          err?.code === "42P01" ||
          /relation .* does not exist/i.test(err?.message ?? "");
        if (!isMissingTable) throw err;
        const fallback = await pool.query(
          `SELECT rp.id AS sprint_id, rp.version AS sprint_name, rp.goal AS sprint_goal,
                  rp.status, rp.started_at, rp.completed_at,
                  rp.committed_points, rp.completed_points
             FROM release_plans rp
            WHERE rp.tenant_id = $1 AND rp.project_id = $2
              AND rp.type = 'sprint_plan' AND rp.status = 'completed'
            ORDER BY COALESCE(rp.completed_at, rp.updated_at) DESC`,
          [tenantId, projectId]
        );
        rows = fallback.rows.map((r: any) => ({ ...r, has_report: false }));
      }

      let reports = rows.map((r: any) => ({
        sprintId: r.sprint_id,
        sprintName: r.sprint_name,
        sprintGoal: r.sprint_goal,
        status: r.status,
        startedAt: r.started_at ?? null,
        completedAt: r.completed_at ?? null,
        committedPoints: Number(r.committed_points ?? 0),
        completedPoints: Number(r.completed_points ?? 0),
        hasReport: !!r.has_report,
        healthScore: r.health_score != null ? Number(r.health_score) : null,
        healthBand: r.health_band ?? null,
        completionPct: r.completion_pct != null ? Number(r.completion_pct) : null,
        totalTickets: r.total_tickets != null ? Number(r.total_tickets) : null,
        completedTickets: r.completed_tickets != null ? Number(r.completed_tickets) : null,
        generatedAt: r.generated_at ?? null,
        generatedById: r.generated_by_id ?? null,
        generatedByName: r.generated_by_name ?? null,
      }));

      // Calculate global stats BEFORE filtering
      const gen = reports.filter((r: any) => r.hasReport);
      const avg = (pick: (r: any) => number | null | undefined) =>
        gen.length === 0 ? 0 : Math.round(gen.reduce((s: number, r: any) => s + (pick(r) ?? 0), 0) / gen.length);
      
      const stats = {
        avgHealth: avg((r: any) => r.healthScore),
        avgCompletion: avg((r: any) => r.completionPct),
        ticketsShipped: gen.reduce((s: number, r: any) => s + (r.completedTickets ?? 0), 0),
        generatedPct: reports.length === 0 ? 0 : Math.round((gen.length / reports.length) * 100),
        generatedCount: gen.length,
        totalCompletedSprints: reports.length
      };

      // Advanced Filters
      const { status, health, completion, dateStart, dateEnd } = req.query;

      if (status === 'generated') reports = reports.filter((r: any) => r.hasReport);
      if (status === 'pending') reports = reports.filter((r: any) => !r.hasReport);

      if (health === 'healthy') reports = reports.filter((r: any) => r.hasReport && r.healthScore != null && r.healthScore >= 80);
      if (health === 'at-risk') reports = reports.filter((r: any) => r.hasReport && r.healthScore != null && r.healthScore >= 60 && r.healthScore < 80);
      if (health === 'critical') reports = reports.filter((r: any) => r.hasReport && r.healthScore != null && r.healthScore < 60);

      if (completion === 'full') reports = reports.filter((r: any) => r.hasReport && r.completionPct != null && r.completionPct >= 100);
      if (completion === 'high') reports = reports.filter((r: any) => r.hasReport && r.completionPct != null && r.completionPct >= 75 && r.completionPct < 100);
      if (completion === 'mid') reports = reports.filter((r: any) => r.hasReport && r.completionPct != null && r.completionPct >= 50 && r.completionPct < 75);
      if (completion === 'low') reports = reports.filter((r: any) => r.hasReport && r.completionPct != null && r.completionPct < 50);

      if (dateStart || dateEnd) {
        reports = reports.filter((r: any) => {
          if (!r.completedAt) return false;
          const d = new Date(r.completedAt);
          if (dateStart && d < new Date(String(dateStart))) return false;
          if (dateEnd && d > new Date(String(dateEnd))) return false;
          return true;
        });
      }

      // Apply Search Filter
      if (search) {
        const q = String(search).toLowerCase();
        reports = reports.filter((r: any) => 
          (r.sprintName || "").toLowerCase().includes(q) ||
          (r.sprintGoal || "").toLowerCase().includes(q)
        );
      }

      // Handle pagination
      const total = reports.length;
      if (page && limit) {
        const p = Number(page);
        const l = Number(limit);
        const paged = reports.slice((p - 1) * l, p * l);
        res.status(200).json({
          success: true,
          data: paged,
          stats,
          pagination: { total, page: p, limit: l }
        } as ApiResponse);
        return;
      }

      res.json({ success: true, data: reports, stats, pagination: { total, page: 1, limit: total } } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportsController] listProjectReports error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to list sprint reports",
      } as ApiResponse);
    }
  }

  /**
   * GET /api/sprint-reports/sprint/:sprintId
   * Returns the stored snapshot (summary + full report_data) for a sprint.
   */
  static async getReportBySprint(req: AuthRequest, res: Response): Promise<void> {
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

      const result = await pool.query(
        `SELECT sprint_id, project_id, sprint_name, sprint_goal, status,
                health_score, health_band, completion_pct, total_tickets, completed_tickets,
                committed_points, completed_points, report_data,
                generated_by_id, generated_at, updated_at
           FROM sprint_reports
          WHERE tenant_id = $1 AND sprint_id = $2
          LIMIT 1`,
        [tenantId, sprintId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: "No report has been generated for this sprint yet",
        } as ApiResponse);
        return;
      }

      const r = result.rows[0];
      res.json({
        success: true,
        data: {
          sprintId: r.sprint_id,
          projectId: r.project_id,
          sprintName: r.sprint_name,
          sprintGoal: r.sprint_goal,
          status: r.status,
          healthScore: r.health_score == null ? null : Number(r.health_score),
          healthBand: r.health_band ?? null,
          completionPct: r.completion_pct == null ? null : Number(r.completion_pct),
          totalTickets: Number(r.total_tickets ?? 0),
          completedTickets: Number(r.completed_tickets ?? 0),
          committedPoints: Number(r.committed_points ?? 0),
          completedPoints: Number(r.completed_points ?? 0),
          report: r.report_data,
          generatedById: r.generated_by_id ?? null,
          generatedAt: r.generated_at ?? null,
          updatedAt: r.updated_at ?? null,
        },
      } as ApiResponse);
    } catch (err: any) {
      console.error("[SprintReportsController] getReportBySprint error:", err);
      const isMissingTable =
        err?.code === "42P01" ||
        /relation .* does not exist/i.test(err?.message ?? "");
      res.status(isMissingTable ? 404 : 500).json({
        success: false,
        error: isMissingTable
          ? "No report has been generated for this sprint yet"
          : "Failed to load sprint report",
      } as ApiResponse);
    }
  }

  /**
   * POST /api/sprint-reports/sprint/:sprintId/generate
   * Generates (or regenerates) the stored report snapshot for a sprint.
   */
  static async generateReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { sprintId } = req.params;

      const summary = await generateSprintReportSnapshot(
        sprintId,
        req.tenantId,
        req.user.id
      );

      if (!summary) {
        res.status(404).json({
          success: false,
          error: "Sprint not found",
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: summary,
        message: "Sprint report generated",
      } as ApiResponse);
    } catch (err) {
      console.error("[SprintReportsController] generateReport error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to generate sprint report",
      } as ApiResponse);
    }
  }
}
