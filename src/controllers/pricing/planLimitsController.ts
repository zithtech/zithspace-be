import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

type PlanLimitRow = {
  id: string;
  plan_variant_id: string;
  limit_id: string;
  limit_value: string;
  created_at: Date;
  updated_at: Date;
  limit_code?: string | null;
  limit_name?: string | null;
  limit_unit?: string | null;
  variant_code?: string | null;
};

const mapRow = (r: PlanLimitRow) => ({
  id: r.id,
  planVariantId: r.plan_variant_id,
  limitId: r.limit_id,
  limitCode: r.limit_code ?? null,
  limitName: r.limit_name ?? null,
  limitUnit: r.limit_unit ?? null,
  variantCode: r.variant_code ?? null,
  limitValue: r.limit_value,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT pl.*,
         l.code AS limit_code, l.name AS limit_name, l.unit AS limit_unit,
         v.code AS variant_code
  FROM pricing_plan_limits pl
  LEFT JOIN pricing_limits_catalog l ON l.id = pl.limit_id
  LEFT JOIN pricing_plan_variants v ON v.id = pl.plan_variant_id
`;

const UNLIMITED_SENTINEL = "UNLIMITED";

function validateLimitValue(v: any): { ok: true; value: string } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") {
    return { ok: false, error: "limitValue is required" };
  }
  const s = String(v).trim();
  if (s === UNLIMITED_SENTINEL) return { ok: true, value: s };
  // Otherwise must be a non-negative integer
  if (!/^\d+$/.test(s)) {
    return { ok: false, error: 'limitValue must be a non-negative integer or "UNLIMITED"' };
  }
  return { ok: true, value: s };
}

export class PlanLimitsController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planVariantId, planId, limitId } = req.query as Record<string, string>;
      const conditions: string[] = [];
      const params: any[] = [];

      if (planVariantId) {
        params.push(planVariantId);
        conditions.push(`pl.plan_variant_id = $${params.length}`);
      }
      if (planId) {
        params.push(planId);
        conditions.push(`v.plan_id = $${params.length}`);
      }
      if (limitId) {
        params.push(limitId);
        conditions.push(`pl.limit_id = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const r = await pool.query<PlanLimitRow>(
        `${SELECT_WITH_CONTEXT}
         ${where}
         ORDER BY l.name ASC`,
        params
      );

      res.json({ success: true, data: r.rows.map(mapRow) } as ApiResponse);
    } catch (err: any) {
      console.error("PlanLimitsController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planVariantId, limitId, limitValue } = req.body ?? {};
      if (!planVariantId || !limitId) {
        res.status(400).json({
          success: false,
          error: "planVariantId and limitId are required",
        } as ApiResponse);
        return;
      }
      const v = validateLimitValue(limitValue);
      if ('error' in v) {
        res.status(400).json({ success: false, error: v.error } as ApiResponse);
        return;
      }

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_plan_limits (plan_variant_id, limit_id, limit_value)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [planVariantId, limitId, v.value]
      );
      const r = await pool.query<PlanLimitRow>(
        `${SELECT_WITH_CONTEXT} WHERE pl.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({
          success: false,
          error: "This limit is already assigned to the variant. Use PUT to update.",
        } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({
          success: false,
          error: "Invalid planVariantId or limitId",
        } as ApiResponse);
        return;
      }
      console.error("PlanLimitsController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { limitValue } = req.body ?? {};
      // Note: planVariantId / limitId not editable — that would be a different row.
      const v = validateLimitValue(limitValue);
      if ('error' in v) {
        res.status(400).json({ success: false, error: v.error } as ApiResponse);
        return;
      }

      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_plan_limits SET limit_value = $1 WHERE id = $2 RETURNING id`,
        [v.value, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Plan limit not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<PlanLimitRow>(
        `${SELECT_WITH_CONTEXT} WHERE pl.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("PlanLimitsController.update error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  // Upsert by (planVariantId, limitId) — convenient for the FE since editing a row
  // doesn't always know if it's a create or update.
  static async upsertByPair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planVariantId, limitId, limitValue } = req.body ?? {};
      if (!planVariantId || !limitId) {
        res.status(400).json({
          success: false,
          error: "planVariantId and limitId are required",
        } as ApiResponse);
        return;
      }
      const v = validateLimitValue(limitValue);
      if ('error' in v) {
        res.status(400).json({ success: false, error: v.error } as ApiResponse);
        return;
      }
      const upserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_plan_limits (plan_variant_id, limit_id, limit_value)
         VALUES ($1, $2, $3)
         ON CONFLICT (plan_variant_id, limit_id)
         DO UPDATE SET limit_value = EXCLUDED.limit_value
         RETURNING id`,
        [planVariantId, limitId, v.value]
      );
      const r = await pool.query<PlanLimitRow>(
        `${SELECT_WITH_CONTEXT} WHERE pl.id = $1`,
        [upserted.rows[0].id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(400).json({
          success: false,
          error: "Invalid planVariantId or limitId",
        } as ApiResponse);
        return;
      }
      console.error("PlanLimitsController.upsertByPair error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_plan_limits WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Plan limit not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      console.error("PlanLimitsController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async removeByPair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planVariantId, limitId } = req.query as Record<string, string>;
      if (!planVariantId || !limitId) {
        res.status(400).json({
          success: false,
          error: "planVariantId and limitId query params are required",
        } as ApiResponse);
        return;
      }
      const r = await pool.query(
        `DELETE FROM pricing_plan_limits
         WHERE plan_variant_id = $1 AND limit_id = $2`,
        [planVariantId, limitId]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Plan limit not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { planVariantId, limitId } } as ApiResponse);
    } catch (err: any) {
      console.error("PlanLimitsController.removeByPair error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
