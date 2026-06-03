import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const ALLOWED_STATUS = new Set(["active", "archived"]);
const ALLOWED_TYPES = new Set([
  "MODULE",
  "PAGE",
  "ACTION",
  "AI",
  "AUTOMATION",
  "LIMIT",
  "INTEGRATION",
  "ADDON",
]);

type FeatureRow = {
  id: string;
  section_id: string | null;
  module_id: string | null;
  page_id: string | null;
  code: string;
  name: string;
  feature_type: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  section_code?: string | null;
  section_name?: string | null;
  module_code?: string | null;
  module_name?: string | null;
  page_code?: string | null;
  page_name?: string | null;
};

const mapRow = (r: FeatureRow) => ({
  id: r.id,
  sectionId: r.section_id,
  sectionCode: r.section_code ?? null,
  sectionName: r.section_name ?? null,
  moduleId: r.module_id,
  moduleCode: r.module_code ?? null,
  moduleName: r.module_name ?? null,
  pageId: r.page_id,
  pageCode: r.page_code ?? null,
  pageName: r.page_name ?? null,
  code: r.code,
  name: r.name,
  featureType: r.feature_type,
  description: r.description,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT f.*,
         s.code AS section_code, s.name AS section_name,
         m.code AS module_code,  m.name AS module_name,
         p.code AS page_code,    p.name AS page_name
  FROM pricing_features f
  LEFT JOIN pricing_sections s ON s.id = f.section_id
  LEFT JOIN pricing_modules  m ON m.id = f.module_id
  LEFT JOIN pricing_pages    p ON p.id = f.page_id
`;

export class FeaturesController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        featureType,
        sectionId,
        moduleId,
        pageId,
        search,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`f.status = $${params.length}`);
      }
      if (featureType && ALLOWED_TYPES.has(featureType)) {
        params.push(featureType);
        conditions.push(`f.feature_type = $${params.length}`);
      }
      if (sectionId) {
        params.push(sectionId);
        conditions.push(`f.section_id = $${params.length}`);
      }
      if (moduleId) {
        params.push(moduleId);
        conditions.push(`f.module_id = $${params.length}`);
      }
      if (pageId) {
        params.push(pageId);
        conditions.push(`f.page_id = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        conditions.push(`(f.name ILIKE $${i} OR f.code ILIKE $${i})`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<FeatureRow>(
          `${SELECT_WITH_CONTEXT}
           ${where}
           ORDER BY f.feature_type ASC, f.name ASC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pricing_features f ${where}`,
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
      console.error("FeaturesController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<FeatureRow>(
        `${SELECT_WITH_CONTEXT} WHERE f.id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Feature not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("FeaturesController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        sectionId,
        moduleId,
        pageId,
        code,
        name,
        featureType,
        description,
        status,
      } = req.body ?? {};

      if (!code || typeof code !== "string" || !CODE_RE.test(code)) {
        res.status(400).json({
          success: false,
          error: "code must be UPPER_SNAKE_CASE (e.g. SPRINT_AI)",
        } as ApiResponse);
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: "name is required" } as ApiResponse);
        return;
      }
      if (!featureType || !ALLOWED_TYPES.has(featureType)) {
        res.status(400).json({
          success: false,
          error: `featureType must be one of: ${Array.from(ALLOWED_TYPES).join(", ")}`,
        } as ApiResponse);
        return;
      }
      const st = status && ALLOWED_STATUS.has(status) ? status : "active";

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_features
           (section_id, module_id, page_id, code, name, feature_type, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          sectionId ?? null,
          moduleId ?? null,
          pageId ?? null,
          code,
          name,
          featureType,
          description ?? null,
          st,
        ]
      );
      const r = await pool.query<FeatureRow>(
        `${SELECT_WITH_CONTEXT} WHERE f.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({
          success: false,
          error: "Invalid sectionId, moduleId or pageId",
        } as ApiResponse);
        return;
      }
      console.error("FeaturesController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        sectionId,
        moduleId,
        pageId,
        code,
        name,
        featureType,
        description,
        status,
      } = req.body ?? {};

      const sets: string[] = [];
      const params: any[] = [];

      if (sectionId !== undefined) {
        params.push(sectionId);
        sets.push(`section_id = $${params.length}`);
      }
      if (moduleId !== undefined) {
        params.push(moduleId);
        sets.push(`module_id = $${params.length}`);
      }
      if (pageId !== undefined) {
        params.push(pageId);
        sets.push(`page_id = $${params.length}`);
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
      if (featureType !== undefined) {
        if (!ALLOWED_TYPES.has(featureType)) {
          res.status(400).json({ success: false, error: "invalid featureType" } as ApiResponse);
          return;
        }
        params.push(featureType);
        sets.push(`feature_type = $${params.length}`);
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

      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_features SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING id`,
        params
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Feature not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<FeatureRow>(
        `${SELECT_WITH_CONTEXT} WHERE f.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({
          success: false,
          error: "Invalid sectionId, moduleId or pageId",
        } as ApiResponse);
        return;
      }
      console.error("FeaturesController.update error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async archive(req: AuthRequest, res: Response): Promise<void> {
    return FeaturesController.setStatus(req, res, "archived");
  }
  static async restore(req: AuthRequest, res: Response): Promise<void> {
    return FeaturesController.setStatus(req, res, "active");
  }

  private static async setStatus(req: AuthRequest, res: Response, status: string): Promise<void> {
    try {
      const { id } = req.params;
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_features SET status = $1 WHERE id = $2 RETURNING id`,
        [status, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Feature not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<FeatureRow>(
        `${SELECT_WITH_CONTEXT} WHERE f.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("FeaturesController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_features WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Feature not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(409).json({
          success: false,
          error: "Cannot delete: feature is referenced by plans or add-ons. Archive instead.",
        } as ApiResponse);
        return;
      }
      console.error("FeaturesController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
