import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const ALLOWED_STATUS = new Set(["active", "archived"]);
const ALLOWED_CYCLES = new Set(["MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME"]);

type VariantRow = {
  id: string;
  plan_id: string;
  code: string;
  name: string;
  billing_cycle: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  plan_code?: string | null;
  plan_name?: string | null;
};

const mapRow = (r: VariantRow) => ({
  id: r.id,
  planId: r.plan_id,
  planCode: r.plan_code ?? null,
  planName: r.plan_name ?? null,
  code: r.code,
  name: r.name,
  billingCycle: r.billing_cycle,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_PLAN = `
  SELECT v.*, p.code AS plan_code, p.name AS plan_name
  FROM pricing_plan_variants v
  LEFT JOIN pricing_plans p ON p.id = v.plan_id
`;

export class PlanVariantsController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        planId,
        billingCycle,
        search,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`v.status = $${params.length}`);
      }
      if (planId) {
        params.push(planId);
        conditions.push(`v.plan_id = $${params.length}`);
      }
      if (billingCycle && ALLOWED_CYCLES.has(billingCycle)) {
        params.push(billingCycle);
        conditions.push(`v.billing_cycle = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        conditions.push(`(v.name ILIKE $${i} OR v.code ILIKE $${i})`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<VariantRow>(
          `${SELECT_WITH_PLAN}
           ${where}
           ORDER BY v.plan_id ASC, v.billing_cycle ASC, v.name ASC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pricing_plan_variants v ${where}`,
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
      console.error("PlanVariantsController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<VariantRow>(
        `${SELECT_WITH_PLAN} WHERE v.id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Variant not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("PlanVariantsController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planId, code, name, billingCycle, status } = req.body ?? {};

      if (!planId) {
        res.status(400).json({ success: false, error: "planId is required" } as ApiResponse);
        return;
      }
      if (!code || typeof code !== "string" || !CODE_RE.test(code)) {
        res.status(400).json({
          success: false,
          error: "code must be UPPER_SNAKE_CASE (e.g. STARTER_MONTHLY)",
        } as ApiResponse);
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: "name is required" } as ApiResponse);
        return;
      }
      if (!billingCycle || !ALLOWED_CYCLES.has(billingCycle)) {
        res.status(400).json({
          success: false,
          error: `billingCycle must be one of: ${Array.from(ALLOWED_CYCLES).join(", ")}`,
        } as ApiResponse);
        return;
      }
      const st = status && ALLOWED_STATUS.has(status) ? status : "active";

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_plan_variants (plan_id, code, name, billing_cycle, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [planId, code, name, billingCycle, st]
      );
      const r = await pool.query<VariantRow>(
        `${SELECT_WITH_PLAN} WHERE v.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid planId" } as ApiResponse);
        return;
      }
      console.error("PlanVariantsController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { planId, code, name, billingCycle, status } = req.body ?? {};

      const sets: string[] = [];
      const params: any[] = [];

      if (planId !== undefined) {
        params.push(planId);
        sets.push(`plan_id = $${params.length}`);
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
      if (billingCycle !== undefined) {
        if (!ALLOWED_CYCLES.has(billingCycle)) {
          res.status(400).json({ success: false, error: "invalid billingCycle" } as ApiResponse);
          return;
        }
        params.push(billingCycle);
        sets.push(`billing_cycle = $${params.length}`);
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
        `UPDATE pricing_plan_variants SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING id`,
        params
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Variant not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<VariantRow>(
        `${SELECT_WITH_PLAN} WHERE v.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid planId" } as ApiResponse);
        return;
      }
      console.error("PlanVariantsController.update error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async archive(req: AuthRequest, res: Response): Promise<void> {
    return PlanVariantsController.setStatus(req, res, "archived");
  }
  static async restore(req: AuthRequest, res: Response): Promise<void> {
    return PlanVariantsController.setStatus(req, res, "active");
  }

  private static async setStatus(req: AuthRequest, res: Response, status: string): Promise<void> {
    try {
      const { id } = req.params;
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_plan_variants SET status = $1 WHERE id = $2 RETURNING id`,
        [status, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Variant not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<VariantRow>(
        `${SELECT_WITH_PLAN} WHERE v.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("PlanVariantsController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_plan_variants WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Variant not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(409).json({
          success: false,
          error: "Cannot delete: variant has prices, features, limits or subscriptions. Archive instead.",
        } as ApiResponse);
        return;
      }
      console.error("PlanVariantsController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
