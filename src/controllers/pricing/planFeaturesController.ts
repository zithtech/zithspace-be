import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

type PlanFeatureRow = {
  id: string;
  plan_id: string;
  feature_id: string;
  created_at: Date;
  feature_code?: string | null;
  feature_name?: string | null;
  feature_type?: string | null;
  plan_code?: string | null;
};

const mapRow = (r: PlanFeatureRow) => ({
  id: r.id,
  planId: r.plan_id,
  featureId: r.feature_id,
  featureCode: r.feature_code ?? null,
  featureName: r.feature_name ?? null,
  featureType: r.feature_type ?? null,
  planCode: r.plan_code ?? null,
  createdAt: r.created_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT pf.*,
         f.code AS feature_code, f.name AS feature_name, f.feature_type,
         p.code AS plan_code
  FROM pricing_plan_features pf
  LEFT JOIN pricing_features f ON f.id = pf.feature_id
  LEFT JOIN pricing_plans p ON p.id = pf.plan_id
`;

export class PlanFeaturesController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planId, featureId } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (planId) {
        params.push(planId);
        conditions.push(`pf.plan_id = $${params.length}`);
      }
      if (featureId) {
        params.push(featureId);
        conditions.push(`pf.feature_id = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const r = await pool.query<PlanFeatureRow>(
        `${SELECT_WITH_CONTEXT}
         ${where}
         ORDER BY f.feature_type ASC, f.name ASC`,
        params
      );

      res.json({
        success: true,
        data: r.rows.map(mapRow),
      } as ApiResponse);
    } catch (err: any) {
      console.error("PlanFeaturesController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planId, featureId } = req.body ?? {};
      if (!planId || !featureId) {
        res.status(400).json({
          success: false,
          error: "planId and featureId are required",
        } as ApiResponse);
        return;
      }
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_plan_features (plan_id, feature_id)
         VALUES ($1, $2)
         RETURNING id`,
        [planId, featureId]
      );
      const r = await pool.query<PlanFeatureRow>(
        `${SELECT_WITH_CONTEXT} WHERE pf.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({
          success: false,
          error: "Feature is already entitled to this plan",
        } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({
          success: false,
          error: "Invalid planId or featureId",
        } as ApiResponse);
        return;
      }
      console.error("PlanFeaturesController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_plan_features WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Entitlement not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      console.error("PlanFeaturesController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  // Remove by composite key — convenient when the FE has (plan, feature) but not the row id
  static async removeByPair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planId, featureId } = req.query as Record<string, string>;
      if (!planId || !featureId) {
        res.status(400).json({
          success: false,
          error: "planId and featureId query params are required",
        } as ApiResponse);
        return;
      }
      const r = await pool.query(
        `DELETE FROM pricing_plan_features
         WHERE plan_id = $1 AND feature_id = $2`,
        [planId, featureId]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Entitlement not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { planId, featureId } } as ApiResponse);
    } catch (err: any) {
      console.error("PlanFeaturesController.removeByPair error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
