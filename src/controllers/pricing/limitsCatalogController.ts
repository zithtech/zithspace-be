import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const ALLOWED_STATUS = new Set(["active", "archived"]);

type LimitRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

const mapRow = (r: LimitRow) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  unit: r.unit,
  description: r.description,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class LimitsCatalogController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        search,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        conditions.push(`(name ILIKE $${i} OR code ILIKE $${i} OR unit ILIKE $${i})`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<LimitRow>(
          `SELECT * FROM pricing_limits_catalog ${where}
           ORDER BY name ASC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pricing_limits_catalog ${where}`,
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
      console.error("LimitsCatalogController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<LimitRow>(
        `SELECT * FROM pricing_limits_catalog WHERE id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Limit not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("LimitsCatalogController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { code, name, unit, description, status } = req.body ?? {};

      if (!code || typeof code !== "string" || !CODE_RE.test(code)) {
        res.status(400).json({
          success: false,
          error: "code must be UPPER_SNAKE_CASE (e.g. USERS, AI_TOKENS)",
        } as ApiResponse);
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: "name is required" } as ApiResponse);
        return;
      }
      if (!unit || typeof unit !== "string") {
        res.status(400).json({
          success: false,
          error: "unit is required (e.g. users, GB, tokens, calls)",
        } as ApiResponse);
        return;
      }
      const st = status && ALLOWED_STATUS.has(status) ? status : "active";

      const r = await pool.query<LimitRow>(
        `INSERT INTO pricing_limits_catalog (code, name, unit, description, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [code, name, unit, description ?? null, st]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      console.error("LimitsCatalogController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { code, name, unit, description, status } = req.body ?? {};

      const sets: string[] = [];
      const params: any[] = [];

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
      if (unit !== undefined) {
        params.push(unit);
        sets.push(`unit = $${params.length}`);
      }
      if (description !== undefined) {
        params.push(description);
        sets.push(`description = $${params.length}`);
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

      const r = await pool.query<LimitRow>(
        `UPDATE pricing_limits_catalog SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING *`,
        params
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Limit not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      console.error("LimitsCatalogController.update error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async archive(req: AuthRequest, res: Response): Promise<void> {
    return LimitsCatalogController.setStatus(req, res, "archived");
  }
  static async restore(req: AuthRequest, res: Response): Promise<void> {
    return LimitsCatalogController.setStatus(req, res, "active");
  }

  private static async setStatus(req: AuthRequest, res: Response, status: string): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<LimitRow>(
        `UPDATE pricing_limits_catalog SET status = $1 WHERE id = $2 RETURNING *`,
        [status, id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Limit not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("LimitsCatalogController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_limits_catalog WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Limit not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(409).json({
          success: false,
          error: "Cannot delete: limit is referenced by plans or add-ons. Archive instead.",
        } as ApiResponse);
        return;
      }
      console.error("LimitsCatalogController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
