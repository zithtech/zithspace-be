import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const ALLOWED_STATUS = new Set(["active", "archived"]);

type PageRow = {
  id: string;
  module_id: string;
  code: string;
  name: string;
  path: string | null;
  description: string | null;
  display_order: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  module_code?: string | null;
  module_name?: string | null;
  section_id?: string | null;
  section_code?: string | null;
  section_name?: string | null;
};

const mapRow = (r: PageRow) => ({
  id: r.id,
  moduleId: r.module_id,
  moduleCode: r.module_code ?? null,
  moduleName: r.module_name ?? null,
  sectionId: r.section_id ?? null,
  sectionCode: r.section_code ?? null,
  sectionName: r.section_name ?? null,
  code: r.code,
  name: r.name,
  path: r.path,
  description: r.description,
  displayOrder: r.display_order,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT p.*,
         m.code AS module_code, m.name AS module_name, m.section_id AS section_id,
         s.code AS section_code, s.name AS section_name
  FROM pricing_pages p
  LEFT JOIN pricing_modules m ON m.id = p.module_id
  LEFT JOIN pricing_sections s ON s.id = m.section_id
`;

export class PagesController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        moduleId,
        sectionId,
        search,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`p.status = $${params.length}`);
      }
      if (moduleId) {
        params.push(moduleId);
        conditions.push(`p.module_id = $${params.length}`);
      }
      if (sectionId) {
        params.push(sectionId);
        conditions.push(`m.section_id = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        conditions.push(`(p.name ILIKE $${i} OR p.code ILIKE $${i} OR p.path ILIKE $${i})`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<PageRow>(
          `${SELECT_WITH_CONTEXT}
           ${where}
           ORDER BY p.display_order ASC, p.name ASC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM pricing_pages p
           LEFT JOIN pricing_modules m ON m.id = p.module_id
           ${where}`,
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
      console.error("PagesController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<PageRow>(
        `${SELECT_WITH_CONTEXT} WHERE p.id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Page not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("PagesController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { moduleId, code, name, path, description, displayOrder, status } = req.body ?? {};

      if (!moduleId) {
        res.status(400).json({ success: false, error: "moduleId is required" } as ApiResponse);
        return;
      }
      if (!code || typeof code !== "string" || !CODE_RE.test(code)) {
        res.status(400).json({
          success: false,
          error: "code must be UPPER_SNAKE_CASE (e.g. LEADS_LIST)",
        } as ApiResponse);
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: "name is required" } as ApiResponse);
        return;
      }
      const st = status && ALLOWED_STATUS.has(status) ? status : "active";

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_pages (module_id, code, name, path, description, display_order, status)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), $7)
         RETURNING id`,
        [moduleId, code, name, path ?? null, description ?? null, displayOrder ?? null, st]
      );
      const r = await pool.query<PageRow>(
        `${SELECT_WITH_CONTEXT} WHERE p.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid moduleId" } as ApiResponse);
        return;
      }
      console.error("PagesController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { moduleId, code, name, path, description, displayOrder, status } = req.body ?? {};

      const sets: string[] = [];
      const params: any[] = [];

      if (moduleId !== undefined) {
        params.push(moduleId);
        sets.push(`module_id = $${params.length}`);
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
      if (path !== undefined) {
        params.push(path);
        sets.push(`path = $${params.length}`);
      }
      if (description !== undefined) {
        params.push(description);
        sets.push(`description = $${params.length}`);
      }
      if (displayOrder !== undefined) {
        params.push(displayOrder);
        sets.push(`display_order = $${params.length}`);
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
        `UPDATE pricing_pages SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING id`,
        params
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Page not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<PageRow>(
        `${SELECT_WITH_CONTEXT} WHERE p.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid moduleId" } as ApiResponse);
        return;
      }
      console.error("PagesController.update error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async archive(req: AuthRequest, res: Response): Promise<void> {
    return PagesController.setStatus(req, res, "archived");
  }
  static async restore(req: AuthRequest, res: Response): Promise<void> {
    return PagesController.setStatus(req, res, "active");
  }

  private static async setStatus(req: AuthRequest, res: Response, status: string): Promise<void> {
    try {
      const { id } = req.params;
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_pages SET status = $1 WHERE id = $2 RETURNING id`,
        [status, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Page not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<PageRow>(
        `${SELECT_WITH_CONTEXT} WHERE p.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("PagesController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_pages WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Page not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(409).json({
          success: false,
          error: "Cannot delete: page is referenced by features. Archive instead.",
        } as ApiResponse);
        return;
      }
      console.error("PagesController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
