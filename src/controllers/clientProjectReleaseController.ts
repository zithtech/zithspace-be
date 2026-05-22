import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";

function shapeRelease(row: any) {
  return {
    id: row.id,
    clientId: row.client_id,
    projectId: row.project_id,
    projectName: row.project_name || null,
    milestoneId: row.milestone_id,
    milestoneName: row.milestone_name || null,
    milestoneStatus: row.milestone_status || null,
    title: row.title,
    version: row.version,
    description: row.description,
    releaseDate: row.release_date,
    createdById: row.created_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ClientProjectReleaseController {
  /** GET /api/clients-v2/:clientId/releases */
  static async list(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const rows = await pool.query(
      `SELECT r.*,
              p.name AS project_name,
              m.name AS milestone_name,
              m.status AS milestone_status
         FROM client_project_releases r
         LEFT JOIN projects p ON p.id = r.project_id
         LEFT JOIN client_milestones m ON m.id = r.milestone_id
        WHERE r.tenant_id = $1 AND r.client_id = $2
        ORDER BY r.release_date DESC NULLS LAST, r.created_at DESC`,
      [tenantId, clientId],
    );
    res.json({
      success: true,
      data: rows.rows.map(shapeRelease),
    });
  }

  /**
   * GET /api/clients-v2/:clientId/releases/milestone-options
   * Returns milestones for the dropdown, excluding completed ones.
   */
  static async milestoneOptions(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const rows = await pool.query(
      `SELECT m.id, m.name, m.status, m.project_id, p.name AS project_name
         FROM client_milestones m
         LEFT JOIN projects p ON p.id = m.project_id
        WHERE m.tenant_id = $1 AND m.client_id = $2
          AND m.status <> 'completed'
        ORDER BY m.position ASC, m.created_at ASC`,
      [tenantId, clientId],
    );
    res.json({
      success: true,
      data: rows.rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        projectId: r.project_id,
        projectName: r.project_name,
      })),
    });
  }

  /**
   * POST /api/clients-v2/:clientId/releases
   * body: { title, version?, description?, releaseDate?, milestoneId? }
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { clientId } = req.params;
    const b = req.body || {};

    if (!b.title || typeof b.title !== "string" || !b.title.trim()) {
      res.status(400).json({ success: false, error: "title is required" });
      return;
    }

    let projectId: string | null = b.projectId || null;
    if (b.milestoneId) {
      const ms = await pool.query(
        `SELECT project_id FROM client_milestones
          WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
        [b.milestoneId, tenantId, clientId],
      );
      if (ms.rowCount === 0) {
        res
          .status(400)
          .json({ success: false, error: "milestoneId is not valid for this client" });
        return;
      }
      // Milestone's project_id wins when present
      projectId = ms.rows[0].project_id || projectId;
    }
    if (projectId && !b.milestoneId) {
      const ok = await pool.query(
        `SELECT 1 FROM client_projects
          WHERE tenant_id = $1 AND client_id = $2 AND project_id = $3`,
        [tenantId, clientId, projectId],
      );
      if (ok.rowCount === 0) {
        res
          .status(400)
          .json({ success: false, error: "projectId is not linked to this client" });
        return;
      }
    }

    const ins = await pool.query(
      `INSERT INTO client_project_releases
         (tenant_id, client_id, project_id, milestone_id,
          title, version, description, release_date, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        tenantId,
        clientId,
        projectId,
        b.milestoneId || null,
        b.title.trim(),
        b.version?.trim() || null,
        b.description || null,
        b.releaseDate || null,
        userId,
      ],
    );

    const row = await pool.query(
      `SELECT r.*,
              p.name AS project_name,
              m.name AS milestone_name,
              m.status AS milestone_status
         FROM client_project_releases r
         LEFT JOIN projects p ON p.id = r.project_id
         LEFT JOIN client_milestones m ON m.id = r.milestone_id
        WHERE r.id = $1`,
      [ins.rows[0].id],
    );
    res.status(201).json({ success: true, data: shapeRelease(row.rows[0]) });
  }

  /** PUT /api/client-releases/:id */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const b = req.body || {};

    const cur = await pool.query(
      `SELECT client_id FROM client_project_releases
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Release not found" });
      return;
    }
    const clientId = cur.rows[0].client_id;

    const sets: string[] = [];
    const params: any[] = [];
    const push = (field: string, value: any) => {
      params.push(value);
      sets.push(`${field} = $${params.length}`);
    };

    if (b.title !== undefined) push("title", String(b.title).trim());
    if (b.version !== undefined)
      push("version", b.version ? String(b.version).trim() : null);
    if (b.description !== undefined) push("description", b.description || null);
    if (b.releaseDate !== undefined) push("release_date", b.releaseDate || null);
    if (b.milestoneId !== undefined) {
      if (b.milestoneId) {
        const ms = await pool.query(
          `SELECT project_id FROM client_milestones
            WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
          [b.milestoneId, tenantId, clientId],
        );
        if (ms.rowCount === 0) {
          res
            .status(400)
            .json({ success: false, error: "milestoneId is not valid for this client" });
          return;
        }
        push("milestone_id", b.milestoneId);
        // Milestone's project wins; fall back to explicit projectId if any
        push(
          "project_id",
          ms.rows[0].project_id || b.projectId || null,
        );
      } else {
        push("milestone_id", null);
        // No milestone — accept an explicit projectId if provided
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
          push("project_id", b.projectId);
        } else {
          push("project_id", null);
        }
      }
    } else if (b.projectId !== undefined) {
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
      push("project_id", b.projectId || null);
    }

    if (sets.length === 0) {
      res.json({ success: true });
      return;
    }
    params.push(id, tenantId);
    await pool.query(
      `UPDATE client_project_releases
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
      params,
    );
    res.json({ success: true });
  }

  /** DELETE /api/client-releases/:id */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const r = await pool.query(
      `DELETE FROM client_project_releases WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Release not found" });
      return;
    }
    res.json({ success: true });
  }
}

export default ClientProjectReleaseController;
