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
    const ms = await pool.query(
      `SELECT m.*, p.name AS project_name
         FROM client_milestones m
         LEFT JOIN projects p ON p.id = m.project_id
        WHERE m.tenant_id = $1 AND m.client_id = $2
        ORDER BY m.position ASC, m.created_at ASC`,
      [ctx.tenantId, ctx.clientId],
    );
    if (ms.rowCount === 0) {
      res.json({ success: true, data: [] });
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
    res.json({
      success: true,
      data: ms.rows.map((row) => {
        const its = byMs.get(row.id) || [];
        const total = its.length;
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
          itemsTotal: total,
          itemsDone: done,
          progress: total > 0 ? Math.round((done / total) * 100) : 0,
          items: its.map((it) => ({
            id: it.id,
            name: it.name,
            description: it.description,
            isCompleted: it.is_completed,
            completedAt: it.completed_at,
            position: it.position,
          })),
        };
      }),
    });
  }
}

export default ClientPortalMilestoneController;
