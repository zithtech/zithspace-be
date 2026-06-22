import pool from "@/config/dbpool";
import { SprintReportController } from "@/controllers/sprintReportController";

/**
 * Sprint Reports v2 — snapshot generation.
 *
 * Generates a frozen snapshot of every report section for a sprint and stores it
 * in `sprint_reports`. Rather than duplicate the (large, intricate) report SQL,
 * we invoke the existing report handlers with a lightweight captured request/
 * response so the snapshot is byte-for-byte identical to the live report. The
 * `bypassSnapshot` flag forces the handlers to compute fresh instead of serving
 * a previously stored snapshot (so regeneration actually recomputes).
 */

type SectionHandler = (req: any, res: any) => Promise<void>;

const SECTIONS: Array<{ key: string; handler: SectionHandler }> = [
  { key: "main", handler: SprintReportController.getSprintReport },
  { key: "timeline", handler: SprintReportController.getSprintTimeline },
  { key: "scope", handler: SprintReportController.getSprintScopeChange },
  { key: "velocity", handler: SprintReportController.getSprintVelocity },
  { key: "quality", handler: SprintReportController.getSprintQuality },
  { key: "hotspots", handler: SprintReportController.getSprintHotspots },
  { key: "bottlenecks", handler: SprintReportController.getSprintBottlenecks },
];

export interface SprintReportSummary {
  sprintId: string;
  projectId: string;
  sprintName: string | null;
  sprintGoal: string | null;
  status: string | null;
  healthScore: number | null;
  healthBand: string | null;
  completionPct: number;
  totalTickets: number;
  completedTickets: number;
  committedPoints: number;
  completedPoints: number;
  generatedById: string | null;
  generatedAt: string;
}

/** Runs a report handler with a captured req/res and returns its `data` payload (or null on error). */
async function captureSection(
  handler: SectionHandler,
  tenantId: string,
  userId: string,
  sprintId: string
): Promise<any | null> {
  let captured: any = null;
  const req: any = {
    tenantId,
    user: { id: userId },
    params: { sprintId },
    query: {},
    bypassSnapshot: true,
  };
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      captured = payload;
      return this;
    },
  };

  await handler(req, res);
  if (!captured || captured.success !== true) return null;
  return captured.data;
}

/**
 * Generates (or regenerates) the stored report snapshot for a sprint.
 * Returns the summary row, or null when the sprint does not exist for the tenant.
 */
export async function generateSprintReportSnapshot(
  sprintId: string,
  tenantId: string,
  userId: string
): Promise<SprintReportSummary | null> {
  const sprintRes = await pool.query(
    `SELECT rp.id, rp.version, rp.goal, rp.status, rp.project_id,
            rp.committed_points, rp.completed_points
       FROM release_plans rp
      WHERE rp.id = $1 AND rp.tenant_id = $2 AND rp.type = 'sprint_plan'
      LIMIT 1`,
    [sprintId, tenantId]
  );
  if (sprintRes.rowCount === 0) return null;
  const sprint = sprintRes.rows[0];

  const reportData: Record<string, any> = {};
  for (const section of SECTIONS) {
    reportData[section.key] = await captureSection(
      section.handler,
      tenantId,
      userId,
      sprintId
    );
  }

  const main = reportData.main;
  if (!main) return null; // cannot build a meaningful report without the core section
  const overview = main.overview ?? {};

  const totalTickets = Number(overview.totalTickets ?? 0);
  const completionPct = Number(overview.completionPct ?? 0);
  const completedTickets = Math.round((completionPct / 100) * totalTickets);
  const healthScore =
    overview.healthScore == null ? null : Number(overview.healthScore);
  const healthBand = overview.healthBand ?? null;
  const committedPoints = Number(
    sprint.committed_points ?? overview.plannedStoryPoints ?? 0
  );
  const completedPoints = Number(
    sprint.completed_points ?? overview.completedStoryPoints ?? 0
  );

  await pool.query(
    `INSERT INTO sprint_reports
       (tenant_id, project_id, sprint_id, sprint_name, sprint_goal, status,
        health_score, health_band, completion_pct, total_tickets, completed_tickets,
        committed_points, completed_points, report_data, generated_by_id, generated_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, NOW(), NOW())
     ON CONFLICT (tenant_id, sprint_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       sprint_name = EXCLUDED.sprint_name,
       sprint_goal = EXCLUDED.sprint_goal,
       status = EXCLUDED.status,
       health_score = EXCLUDED.health_score,
       health_band = EXCLUDED.health_band,
       completion_pct = EXCLUDED.completion_pct,
       total_tickets = EXCLUDED.total_tickets,
       completed_tickets = EXCLUDED.completed_tickets,
       committed_points = EXCLUDED.committed_points,
       completed_points = EXCLUDED.completed_points,
       report_data = EXCLUDED.report_data,
       generated_by_id = EXCLUDED.generated_by_id,
       generated_at = NOW(),
       updated_at = NOW()`,
    [
      tenantId,
      sprint.project_id,
      sprintId,
      sprint.version ?? null,
      sprint.goal ?? null,
      sprint.status ?? null,
      healthScore,
      healthBand,
      completionPct,
      totalTickets,
      completedTickets,
      committedPoints,
      completedPoints,
      JSON.stringify(reportData),
      userId,
    ]
  );

  return {
    sprintId,
    projectId: sprint.project_id,
    sprintName: sprint.version ?? null,
    sprintGoal: sprint.goal ?? null,
    status: sprint.status ?? null,
    healthScore,
    healthBand,
    completionPct,
    totalTickets,
    completedTickets,
    committedPoints,
    completedPoints,
    generatedById: userId,
    generatedAt: new Date().toISOString(),
  };
}
