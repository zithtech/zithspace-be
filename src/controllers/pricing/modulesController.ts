import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const ALLOWED_STATUS = new Set(["active", "archived"]);

type ModuleRow = {
  id: string;
  section_id: string;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  icon: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  section_code?: string | null;
  section_name?: string | null;
};

const mapRow = (r: ModuleRow) => ({
  id: r.id,
  sectionId: r.section_id,
  sectionCode: r.section_code ?? null,
  sectionName: r.section_name ?? null,
  code: r.code,
  name: r.name,
  description: r.description,
  displayOrder: r.display_order,
  icon: r.icon,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class ModulesController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        sectionId,
        search,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`m.status = $${params.length}`);
      }
      if (sectionId) {
        params.push(sectionId);
        conditions.push(`m.section_id = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(m.name ILIKE $${params.length} OR m.code ILIKE $${params.length})`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<ModuleRow>(
          `SELECT m.*, s.code AS section_code, s.name AS section_name
           FROM pricing_modules m
           LEFT JOIN pricing_sections s ON s.id = m.section_id
           ${where}
           ORDER BY m.display_order ASC, m.name ASC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pricing_modules m ${where}`,
          params
        ),
      ]);

      const total = Number(countResult.rows[0]?.count || 0);

      res.json({
        success: true,
        data: rowsResult.rows.map(mapRow),
        pagination: {
          page: pageNum,
          limit: lim,
          total,
          pages: Math.ceil(total / lim) || 1,
        },
      } as ApiResponse);
    } catch (err: any) {
      console.error("ModulesController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<ModuleRow>(
        `SELECT m.*, s.code AS section_code, s.name AS section_name
         FROM pricing_modules m
         LEFT JOIN pricing_sections s ON s.id = m.section_id
         WHERE m.id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Module not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("ModulesController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { sectionId, code, name, description, displayOrder, icon, status } = req.body ?? {};

      if (!sectionId) {
        res.status(400).json({ success: false, error: "sectionId is required" } as ApiResponse);
        return;
      }
      if (!code || typeof code !== "string" || !CODE_RE.test(code)) {
        res.status(400).json({
          success: false,
          error: "code must be UPPER_SNAKE_CASE (e.g. CRM_LEADS)",
        } as ApiResponse);
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: "name is required" } as ApiResponse);
        return;
      }
      const st = status && ALLOWED_STATUS.has(status) ? status : "active";

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_modules (section_id, code, name, description, display_order, icon, status)
         VALUES ($1, $2, $3, $4, COALESCE($5, 0), $6, $7)
         RETURNING id`,
        [sectionId, code, name, description ?? null, displayOrder ?? null, icon ?? null, st]
      );
      const r = await pool.query<ModuleRow>(
        `SELECT m.*, s.code AS section_code, s.name AS section_name
         FROM pricing_modules m
         LEFT JOIN pricing_sections s ON s.id = m.section_id
         WHERE m.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid sectionId" } as ApiResponse);
        return;
      }
      console.error("ModulesController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { sectionId, code, name, description, displayOrder, icon, status } = req.body ?? {};

      const sets: string[] = [];
      const params: any[] = [];

      if (sectionId !== undefined) {
        params.push(sectionId);
        sets.push(`section_id = $${params.length}`);
      }
      if (code !== undefined) {
        if (typeof code !== "string" || !CODE_RE.test(code)) {
          res.status(400).json({ success: false, error: "code must be UPPER_SNAKE_CASE" } as ApiResponse);
          return;
        }
        params.push(code);
        sets.push(`code = $${params.length}`);
      }
      if (name !== undefined) {
        params.push(name);
        sets.push(`name = $${params.length}`);
      }
      if (description !== undefined) {
        params.push(description);
        sets.push(`description = $${params.length}`);
      }
      if (displayOrder !== undefined) {
        params.push(displayOrder);
        sets.push(`display_order = $${params.length}`);
      }
      if (icon !== undefined) {
        params.push(icon);
        sets.push(`icon = $${params.length}`);
      }
      if (status !== undefined) {
        if (!ALLOWED_STATUS.has(status)) {
          res.status(400).json({ success: false, error: "invalid status" } as ApiResponse);
          return;
        }
        params.push(status);
        sets.push(`status = $${params.length}`);
      }

      if (!sets.length) {
        res.status(400).json({ success: false, error: "no fields to update" } as ApiResponse);
        return;
      }
      params.push(id);

      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_modules SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING id`,
        params
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Module not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<ModuleRow>(
        `SELECT m.*, s.code AS section_code, s.name AS section_name
         FROM pricing_modules m
         LEFT JOIN pricing_sections s ON s.id = m.section_id
         WHERE m.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid sectionId" } as ApiResponse);
        return;
      }
      console.error("ModulesController.update error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async archive(req: AuthRequest, res: Response): Promise<void> {
    return ModulesController.setStatus(req, res, "archived");
  }
  static async restore(req: AuthRequest, res: Response): Promise<void> {
    return ModulesController.setStatus(req, res, "active");
  }

  private static async setStatus(req: AuthRequest, res: Response, status: string): Promise<void> {
    try {
      const { id } = req.params;
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_modules SET status = $1 WHERE id = $2 RETURNING id`,
        [status, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Module not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<ModuleRow>(
        `SELECT m.*, s.code AS section_code, s.name AS section_name
         FROM pricing_modules m
         LEFT JOIN pricing_sections s ON s.id = m.section_id
         WHERE m.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("ModulesController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_modules WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Module not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(409).json({
          success: false,
          error: "Cannot delete: module is referenced by pages or features. Archive instead.",
        } as ApiResponse);
        return;
      }
      console.error("ModulesController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
