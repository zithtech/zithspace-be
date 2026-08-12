import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";
import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";

const VALID_STATUS = new Set([
  "not_started",
  "in_progress",
  "completed",
  "on_hold",
  "cancelled",
]);

function shapeMilestone(row: any, items: any[]) {
  const total = items.length;
  const done = items.filter((it) => it.is_completed).length;
  return {
    id: row.id,
    clientId: row.client_id,
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
    createdByName: row.created_by_name || null,
    itemsTotal: total,
    itemsDone: done,
    progress: total > 0 ? Math.round((done / total) * 100) : 0,
    items: items.map((it) => ({
      id: it.id,
      milestoneId: it.milestone_id,
      name: it.name,
      description: it.description,
      isCompleted: it.is_completed,
      completedAt: it.completed_at,
      completedById: it.completed_by_id,
      position: it.position,
      createdAt: it.created_at,
      updatedAt: it.updated_at,
    })),
  };
}

/**
 * If every item on a milestone is completed, flip status to 'completed' and
 * stamp `actual_end_date`. If an item just became un-completed and the
 * milestone was 'completed', drop it back to 'in_progress' and clear
 * `actual_end_date`. If at least one item is done and status is
 * 'not_started', promote to 'in_progress'.
 *
 * Skips re-syncing when the milestone is manually parked in 'on_hold' or
 * 'cancelled' — that's a deliberate staff choice and progress shouldn't
 * override it.
 */
async function syncMilestoneStatusFromItems(milestoneId: string, tenantId: string) {
  const m = await pool.query(
    `SELECT status FROM client_milestones
      WHERE id = $1 AND tenant_id = $2`,
    [milestoneId, tenantId],
  );
  if (m.rowCount === 0) return;
  const status = m.rows[0].status as string;
  if (status === "on_hold" || status === "cancelled") return;

  const counts = await pool.query(
    `SELECT COUNT(*)::int AS total,
            SUM(CASE WHEN is_completed THEN 1 ELSE 0 END)::int AS done
       FROM client_milestone_items
      WHERE milestone_id = $1 AND tenant_id = $2`,
    [milestoneId, tenantId],
  );
  const total = counts.rows[0].total || 0;
  const done = counts.rows[0].done || 0;

  let nextStatus = status;
  let nextActual: "set" | "clear" | "leave" = "leave";

  if (total > 0 && done === total) {
    nextStatus = "completed";
    nextActual = "set";
  } else if (status === "completed") {
    nextStatus = "in_progress";
    nextActual = "clear";
  } else if (done > 0 && status === "not_started") {
    nextStatus = "in_progress";
  }

  if (nextStatus === status && nextActual === "leave") return;

  await pool.query(
    `UPDATE client_milestones
        SET status = $1,
            actual_end_date = CASE
              WHEN $2::text = 'set'   THEN CURRENT_DATE
              WHEN $2::text = 'clear' THEN NULL
              ELSE actual_end_date
            END,
            updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4`,
    [nextStatus, nextActual, milestoneId, tenantId],
  );
}

export class ClientMilestoneController {
  /** GET /api/clients-v2/:clientId/milestones */
  static async list(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const ms = await pool.query(
      `SELECT m.*, p.name AS project_name, u.name AS created_by_name
         FROM client_milestones m
         LEFT JOIN projects p ON p.id = m.project_id
         LEFT JOIN users u ON u.id = m.created_by_id
        WHERE m.tenant_id = $1 AND m.client_id = $2
        ORDER BY m.position ASC, m.created_at ASC`,
      [tenantId, clientId],
    );
    if (ms.rowCount === 0) {
      res.json({ success: true, data: [] });
      return;
    }
    const ids = ms.rows.map((r) => r.id);
    const items = await pool.query(
      `SELECT * FROM client_milestone_items
        WHERE tenant_id = $1 AND milestone_id = ANY($2::text[])
        ORDER BY position ASC, created_at ASC`,
      [tenantId, ids],
    );
    const byMs = new Map<string, any[]>();
    for (const it of items.rows) {
      const arr = byMs.get(it.milestone_id) || [];
      arr.push(it);
      byMs.set(it.milestone_id, arr);
    }
    res.json({
      success: true,
      data: ms.rows.map((r) => shapeMilestone(r, byMs.get(r.id) || [])),
    });
  }

  /**
   * POST /api/clients-v2/:clientId/milestones
   * body: { name, description?, status?, estStartDate?, estEndDate?,
   *         actualEndDate?, projectId?, items?: [{name, description?}] }
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { clientId } = req.params;
    const b = req.body || {};

    if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
      res.status(400).json({ success: false, error: "name is required" });
      return;
    }
    const status = (b.status || "not_started").toLowerCase();
    if (!VALID_STATUS.has(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }
    if (b.projectId) {
      const ok = await pool.query(
        `SELECT 1 FROM client_projects
          WHERE tenant_id = $1 AND client_id = $2 AND project_id = $3`,
        [tenantId, clientId, b.projectId],
      );
      if (ok.rowCount === 0) {
        res
          .status(400)
          .json({ success: false, error: "projectId is not linked to this client" });
        return;
      }
    }

    const posRes = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next
         FROM client_milestones
        WHERE tenant_id = $1 AND client_id = $2`,
      [tenantId, clientId],
    );
    const position = posRes.rows[0].next;

    const ins = await pool.query(
      `INSERT INTO client_milestones
         (tenant_id, client_id, project_id, name, description, status,
          est_start_date, est_end_date, actual_end_date, position,
          created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        tenantId,
        clientId,
        b.projectId || null,
        b.name.trim(),
        b.description?.trim() || null,
        status,
        b.estStartDate || null,
        b.estEndDate || null,
        b.actualEndDate || null,
        position,
        userId,
      ],
    );
    const milestoneId = ins.rows[0].id;

    // Bulk-insert breakdown items if provided
    if (Array.isArray(b.items) && b.items.length > 0) {
      const values: string[] = [];
      const params: any[] = [];
      let i = 1;
      b.items.forEach((it: any, idx: number) => {
        if (!it?.name?.trim()) return;
        values.push(
          `($${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
        );
        params.push(
          tenantId,
          milestoneId,
          it.name.trim(),
          it.description?.trim() || null,
          idx,
        );
      });
      if (values.length > 0) {
        await pool.query(
          `INSERT INTO client_milestone_items
             (tenant_id, milestone_id, name, description, position)
           VALUES ${values.join(",")}`,
          params,
        );
      }
    }

    await syncMilestoneStatusFromItems(milestoneId, tenantId);

    // Return shaped row
    const row = await pool.query(
      `SELECT m.*, p.name AS project_name, u.name AS created_by_name
         FROM client_milestones m
         LEFT JOIN projects p ON p.id = m.project_id
         LEFT JOIN users u ON u.id = m.created_by_id
        WHERE m.id = $1`,
      [milestoneId],
    );
    const items = await pool.query(
      `SELECT * FROM client_milestone_items
        WHERE milestone_id = $1
        ORDER BY position ASC`,
      [milestoneId],
    );
    res.status(201).json({
      success: true,
      data: shapeMilestone(row.rows[0], items.rows),
    });
  }

  /** PUT /api/milestones/:id */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const b = req.body || {};

    const sets: string[] = [];
    const params: any[] = [];
    const push = (field: string, value: any) => {
      params.push(value);
      sets.push(`${field} = $${params.length}`);
    };

    if (b.name !== undefined) push("name", String(b.name).trim());
    if (b.description !== undefined)
      push("description", b.description ? String(b.description).trim() : null);
    if (b.status !== undefined) {
      const s = String(b.status).toLowerCase();
      if (!VALID_STATUS.has(s)) {
        res.status(400).json({ success: false, error: "Invalid status" });
        return;
      }
      push("status", s);
      // When the user manually marks completed, stamp the date (unless they
      // also passed actualEndDate explicitly).
      if (s === "completed" && b.actualEndDate === undefined) {
        push("actual_end_date", new Date().toISOString().slice(0, 10));
      }
      if (s !== "completed" && b.actualEndDate === undefined) {
        push("actual_end_date", null);
      }
    }
    if (b.estStartDate !== undefined) push("est_start_date", b.estStartDate || null);
    if (b.estEndDate !== undefined) push("est_end_date", b.estEndDate || null);
    if (b.actualEndDate !== undefined) push("actual_end_date", b.actualEndDate || null);
    if (b.projectId !== undefined) push("project_id", b.projectId || null);

    if (sets.length === 0) {
      res.json({ success: true });
      return;
    }
    params.push(id, tenantId);
    const r = await pool.query(
      `UPDATE client_milestones
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING client_id`,
      params,
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Milestone not found" });
      return;
    }
    
    recordTransaction({
      req,
      parentEntityType: EntityType.CLIENT,
      parentEntityId: (r.rows[0] as any).client_id,
      section: Section.ADMIN,
      module: Module.CLIENTS_V2,
      page: Page.CLIENT_DETAIL,
      action: Action.UPDATE,
      actionLabel: `Updated milestone`,
      entityType: "client_portal_data",
      statusCode: 200,
    });
res.json({ success: true });
  }

  /** DELETE /api/milestones/:id */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const r = await pool.query(
      `DELETE FROM client_milestones WHERE id = $1 AND tenant_id = $2 RETURNING client_id`,
      [id, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Milestone not found" });
      return;
    }

    recordTransaction({
      req,
      parentEntityType: EntityType.CLIENT,
      parentEntityId: (r.rows[0] as any).client_id,
      section: Section.ADMIN,
      module: Module.CLIENTS_V2,
      page: Page.CLIENT_DETAIL,
      action: Action.DELETE,
      actionLabel: `Deleted milestone`,
      entityType: "client_portal_data",
      statusCode: 200,
    });

    res.json({ success: true });
  }

  /** POST /api/milestones/:id/items  body: { name, description? } */
  static async addItem(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id: milestoneId } = req.params;
    const b = req.body || {};
    if (!b.name || typeof b.name !== "string" || !b.name.trim()) {
      res.status(400).json({ success: false, error: "name is required" });
      return;
    }
    const ms = await pool.query(
      `SELECT 1 FROM client_milestones
        WHERE id = $1 AND tenant_id = $2`,
      [milestoneId, tenantId],
    );
    if (ms.rowCount === 0) {
      res.status(404).json({ success: false, error: "Milestone not found" });
      return;
    }
    const posRes = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next
         FROM client_milestone_items
        WHERE milestone_id = $1`,
      [milestoneId],
    );
    const ins = await pool.query(
      `INSERT INTO client_milestone_items
         (tenant_id, milestone_id, name, description, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, is_completed, completed_at,
                 completed_by_id, position, created_at, updated_at,
                 milestone_id`,
      [
        tenantId,
        milestoneId,
        b.name.trim(),
        b.description?.trim() || null,
        posRes.rows[0].next,
      ],
    );
    await syncMilestoneStatusFromItems(milestoneId, tenantId);
    res.status(201).json({ success: true, data: ins.rows[0] });
  }

  /**
   * PUT /api/milestone-items/:id
   * body: { name?, description?, isCompleted? }
   */
  static async updateItem(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const b = req.body || {};

    const cur = await pool.query(
      `SELECT milestone_id, is_completed FROM client_milestone_items
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Item not found" });
      return;
    }
    const milestoneId = cur.rows[0].milestone_id;

    const sets: string[] = [];
    const params: any[] = [];
    const push = (field: string, value: any) => {
      params.push(value);
      sets.push(`${field} = $${params.length}`);
    };
    if (b.name !== undefined) push("name", String(b.name).trim());
    if (b.description !== undefined)
      push("description", b.description ? String(b.description).trim() : null);
    if (b.isCompleted !== undefined) {
      const next = !!b.isCompleted;
      push("is_completed", next);
      if (next && !cur.rows[0].is_completed) {
        push("completed_at", new Date().toISOString());
        push("completed_by_id", userId);
      } else if (!next && cur.rows[0].is_completed) {
        push("completed_at", null);
        push("completed_by_id", null);
      }
    }
    if (sets.length === 0) {
      res.json({ success: true });
      return;
    }
    params.push(id, tenantId);
    await pool.query(
      `UPDATE client_milestone_items
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
      params,
    );
    await syncMilestoneStatusFromItems(milestoneId, tenantId);
    res.json({ success: true });
  }

  /** DELETE /api/milestone-items/:id */
  static async removeItem(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const cur = await pool.query(
      `SELECT milestone_id FROM client_milestone_items
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Item not found" });
      return;
    }
    const milestoneId = cur.rows[0].milestone_id;
    await pool.query(
      `DELETE FROM client_milestone_items
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    await syncMilestoneStatusFromItems(milestoneId, tenantId);
    res.json({ success: true });
  }
}

export default ClientMilestoneController;
