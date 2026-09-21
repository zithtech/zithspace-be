import { Request, Response } from "express";
import pool from "@/config/dbpool";

/**
 * Read-only milestones endpoint for the client portal. Mirrors the staff
 * shape but scopes everything to the authenticated portal user's client.
 */
export class ClientPortalMilestoneController {
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const search = ((req.query.search as string) || "").trim();
    const status = ((req.query.status as string) || "").trim();
    const projectId = ((req.query.projectId as string) || "").trim();
    const fromDate = (req.query.from as string) || "";
    const toDate = (req.query.to as string) || "";
    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "15", 10)),
    );
    const offset = (page - 1) * limit;

    const params: any[] = [ctx.tenantId, ctx.clientId];
    let where = `WHERE m.tenant_id = $1 AND m.client_id = $2`;

    if (status && status !== "ALL") {
      params.push(status);
      where += ` AND m.status = $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      where += ` AND m.project_id = $${params.length}`;
    }
    if (fromDate) {
      params.push(fromDate);
      where += ` AND (m.est_end_date IS NOT NULL AND m.est_end_date >= $${params.length}::date OR m.est_start_date IS NOT NULL AND m.est_start_date >= $${params.length}::date)`;
    }
    if (toDate) {
      params.push(toDate);
      where += ` AND (m.est_start_date IS NOT NULL AND m.est_start_date <= $${params.length}::date OR m.est_end_date IS NOT NULL AND m.est_end_date <= $${params.length}::date)`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (m.name ILIKE $${params.length}
                   OR COALESCE(m.description, '') ILIKE $${params.length}
                   OR p.name ILIKE $${params.length})`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM client_milestones m LEFT JOIN projects p ON p.id = m.project_id ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    // Status counts
    const countsRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
         COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed,
         COUNT(CASE WHEN status = 'on_hold' THEN 1 END)::int AS on_hold,
         COUNT(CASE WHEN status = 'not_started' THEN 1 END)::int AS not_started,
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled
       FROM client_milestones
      WHERE tenant_id = $1 AND client_id = $2`,
      [ctx.tenantId, ctx.clientId],
    );

    const counts = {
      total: countsRes.rows[0]?.total || 0,
      in_progress: countsRes.rows[0]?.in_progress || 0,
      completed: countsRes.rows[0]?.completed || 0,
      on_hold: countsRes.rows[0]?.on_hold || 0,
      not_started: countsRes.rows[0]?.not_started || 0,
      cancelled: countsRes.rows[0]?.cancelled || 0,
    };

    // Distinct projects
    const projectsRes = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.code
         FROM client_milestones m
         JOIN projects p ON p.id = m.project_id
        WHERE m.tenant_id = $1 AND m.client_id = $2
        ORDER BY p.name ASC`,
      [ctx.tenantId, ctx.clientId],
    );

    let query = `SELECT m.*, p.name AS project_name
         FROM client_milestones m
         LEFT JOIN projects p ON p.id = m.project_id
         ${where}
        ORDER BY m.position ASC, m.created_at ASC`;

    if (hasPagination) {
      params.push(limit);
      params.push(offset);
      query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    const ms = await pool.query(query, params);

    if (ms.rowCount === 0) {
      res.json({
        success: true,
        data: [],
        meta: {
          total,
          page: hasPagination ? page : 1,
          limit: hasPagination ? limit : 15,
          totalPages: hasPagination ? Math.ceil(total / limit) : 1,
          counts,
          projects: projectsRes.rows.map((p) => ({
            id: p.id,
            name: p.name,
            code: p.code,
          })),
        },
      });
      return;
    }

    const ids = ms.rows.map((r) => r.id);
    const items = await pool.query(
      `SELECT id, milestone_id, name, description, is_completed,
              completed_at, position
         FROM client_milestone_items
        WHERE tenant_id = $1 AND milestone_id = ANY($2::text[])
        ORDER BY position ASC, created_at ASC`,
      [ctx.tenantId, ids],
    );
    const byMs = new Map<string, any[]>();
    for (const it of items.rows) {
      const arr = byMs.get(it.milestone_id) || [];
      arr.push(it);
      byMs.set(it.milestone_id, arr);
    }

    const data = ms.rows.map((row) => {
      const its = byMs.get(row.id) || [];
      const itTotal = its.length;
      const done = its.filter((it) => it.is_completed).length;
      return {
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name || null,
        name: row.name,
        description: row.description,
        status: row.status,
        estStartDate: row.est_start_date,
        estEndDate: row.est_end_date,
        actualEndDate: row.actual_end_date,
        position: row.position,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        itemsTotal: itTotal,
        itemsDone: done,
        progress: itTotal > 0 ? Math.round((done / itTotal) * 100) : 0,
        items: its.map((it) => ({
          id: it.id,
          name: it.name,
          description: it.description,
          isCompleted: it.is_completed,
          completedAt: it.completed_at,
          position: it.position,
        })),
      };
    });

    res.json({
      success: true,
      data,
      meta: {
        total,
        page: hasPagination ? page : 1,
        limit: hasPagination ? limit : total,
        totalPages: hasPagination ? Math.ceil(total / limit) : 1,
        counts,
        projects: projectsRes.rows.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
        })),
      },
    });
  }
}

export default ClientPortalMilestoneController;
