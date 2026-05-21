import { Request, Response } from "express";
import pool from "@/config/dbpool";

/**
 * Portal-facing controller for the client-management Releases feature.
 * Reads from `client_project_releases`, scoped to the portal user's tenant
 * and client. Read-only.
 */

function shapeRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    version: row.version,
    description: row.description,
    releaseDate: row.release_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    milestone: row.milestone_id
      ? {
          id: row.milestone_id,
          name: row.milestone_name,
          status: row.milestone_status,
        }
      : null,
    project: row.project_id
      ? {
          id: row.project_id,
          name: row.project_name,
          code: row.project_code,
        }
      : null,
  };
}

export class ClientPortalReleaseController {
  /**
   * GET /api/client-portal/releases?search=&projectId=&milestoneId=&page=&limit=
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const search = ((req.query.search as string) || "").trim();
    const projectFilter = (req.query.projectId as string) || "";
    const milestoneFilter = (req.query.milestoneId as string) || "";
    const fromDate = (req.query.from as string) || "";
    const toDate = (req.query.to as string) || "";
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [ctx.tenantId, ctx.clientId];
    let where = `WHERE r.tenant_id = $1 AND r.client_id = $2`;
    if (projectFilter) {
      params.push(projectFilter);
      where += ` AND r.project_id = $${params.length}`;
    }
    if (milestoneFilter) {
      params.push(milestoneFilter);
      where += ` AND r.milestone_id = $${params.length}`;
    }
    if (fromDate) {
      params.push(fromDate);
      where += ` AND COALESCE(r.release_date, r.created_at::date) >= $${params.length}::date`;
    }
    if (toDate) {
      params.push(toDate);
      where += ` AND COALESCE(r.release_date, r.created_at::date) <= $${params.length}::date`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (r.title ILIKE $${params.length}
                   OR COALESCE(r.version,'') ILIKE $${params.length})`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM client_project_releases r ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    params.push(limit);
    params.push(offset);

    const list = await pool.query(
      `SELECT r.id, r.title, r.version, r.description, r.release_date,
              r.created_at, r.updated_at,
              r.milestone_id,
              m.name   AS milestone_name,
              m.status AS milestone_status,
              r.project_id,
              p.name AS project_name,
              p.code AS project_code
         FROM client_project_releases r
         LEFT JOIN client_milestones m ON m.id = r.milestone_id
         LEFT JOIN projects p ON p.id = r.project_id
         ${where}
         ORDER BY COALESCE(r.release_date, r.created_at::date) DESC,
                  r.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Filter facets — projects + milestones available to this client
    const facets = await pool.query(
      `SELECT DISTINCT r.project_id, r.milestone_id
         FROM client_project_releases r
        WHERE r.tenant_id = $1 AND r.client_id = $2`,
      [ctx.tenantId, ctx.clientId],
    );
    const projectSet = new Set<string>();
    const milestoneSet = new Set<string>();
    for (const f of facets.rows) {
      if (f.project_id) projectSet.add(f.project_id);
      if (f.milestone_id) milestoneSet.add(f.milestone_id);
    }
    const projects =
      projectSet.size > 0
        ? (
            await pool.query(
              `SELECT id, name, code FROM projects
                WHERE id = ANY($1::text[]) ORDER BY name ASC`,
              [Array.from(projectSet)],
            )
          ).rows
        : [];
    const milestones =
      milestoneSet.size > 0
        ? (
            await pool.query(
              `SELECT id, name, status FROM client_milestones
                WHERE id = ANY($1::text[]) ORDER BY name ASC`,
              [Array.from(milestoneSet)],
            )
          ).rows
        : [];

    // Aggregate stats — always reflect the client scope, NOT the active
    // filters, so the cards stay stable as filters change.
    const stats = await pool.query(
      `WITH base AS (
         SELECT r.id, r.release_date, r.created_at, r.version, r.project_id,
                r.milestone_id
           FROM client_project_releases r
          WHERE r.tenant_id = $1 AND r.client_id = $2
       ),
       latest AS (
         SELECT version, COALESCE(release_date, created_at::date) AS rel_date
           FROM base
          ORDER BY COALESCE(release_date, created_at::date) DESC,
                   created_at DESC
          LIMIT 1
       )
       SELECT
         (SELECT COUNT(*)::int FROM base) AS total,
         (SELECT COUNT(*)::int FROM base
           WHERE COALESCE(release_date, created_at::date) >= date_trunc('month', CURRENT_DATE)
             AND COALESCE(release_date, created_at::date) <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
         ) AS this_month,
         (SELECT COUNT(DISTINCT project_id)::int FROM base WHERE project_id IS NOT NULL) AS distinct_projects,
         (SELECT COUNT(*)::int FROM base WHERE milestone_id IS NOT NULL) AS with_milestone,
         (SELECT version FROM latest) AS latest_version,
         (SELECT rel_date FROM latest) AS latest_date`,
      [ctx.tenantId, ctx.clientId],
    );
    const s = stats.rows[0] || {};

    res.json({
      success: true,
      data: list.rows.map(shapeRow),
      meta: {
        total,
        page,
        limit,
        projects,
        milestones,
        stats: {
          total: s.total || 0,
          thisMonth: s.this_month || 0,
          distinctProjects: s.distinct_projects || 0,
          withMilestone: s.with_milestone || 0,
          latestVersion: s.latest_version || null,
          latestDate: s.latest_date || null,
        },
      },
    });
  }

  /** GET /api/client-portal/releases/:id */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;

    const r = await pool.query(
      `SELECT r.*,
              m.name   AS milestone_name,
              m.status AS milestone_status,
              p.name AS project_name,
              p.code AS project_code
         FROM client_project_releases r
         LEFT JOIN client_milestones m ON m.id = r.milestone_id
         LEFT JOIN projects p ON p.id = r.project_id
        WHERE r.id = $1
          AND r.tenant_id = $2
          AND r.client_id = $3`,
      [id, ctx.tenantId, ctx.clientId],
    );
    const row = r.rows[0];
    if (!row) {
      res.status(404).json({ success: false, error: "Release not found" });
      return;
    }

    res.json({ success: true, data: shapeRow(row) });
  }
}

export default ClientPortalReleaseController;
