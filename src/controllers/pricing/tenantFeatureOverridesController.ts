import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

type Row = {
  id: string;
  tenant_id: string;
  feature_id: string;
  is_enabled: boolean;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
  feature_code?: string | null;
  feature_name?: string | null;
  feature_type?: string | null;
};

const mapRow = (r: Row) => ({
  id: r.id,
  tenantId: r.tenant_id,
  featureId: r.feature_id,
  featureCode: r.feature_code ?? null,
  featureName: r.feature_name ?? null,
  featureType: r.feature_type ?? null,
  isEnabled: r.is_enabled,
  reason: r.reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT o.*,
         f.code AS feature_code, f.name AS feature_name, f.feature_type
  FROM pricing_tenant_feature_overrides o
  LEFT JOIN pricing_features f ON f.id = o.feature_id
`;

export class TenantFeatureOverridesController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId, featureId } = req.query as Record<string, string>;
      const conditions: string[] = [];
      const params: any[] = [];
      if (tenantId) {
        params.push(tenantId);
        conditions.push(`o.tenant_id = $${params.length}`);
      }
      if (featureId) {
        params.push(featureId);
        conditions.push(`o.feature_id = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const r = await pool.query<Row>(
        `${SELECT_WITH_CONTEXT} ${where} ORDER BY f.name ASC`,
        params
      );
      res.json({ success: true, data: r.rows.map(mapRow) } as ApiResponse);
    } catch (err: any) {
      console.error("TenantFeatureOverridesController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async upsertByPair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId, featureId, isEnabled, reason } = req.body ?? {};
      if (!tenantId || !featureId) {
        res.status(400).json({
          success: false,
          error: "tenantId and featureId are required",
        } as ApiResponse);
        return;
      }
      if (typeof isEnabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: "isEnabled must be true or false",
        } as ApiResponse);
        return;
      }
      const upserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_tenant_feature_overrides
           (tenant_id, feature_id, is_enabled, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, feature_id)
         DO UPDATE SET is_enabled = EXCLUDED.is_enabled, reason = EXCLUDED.reason
         RETURNING id`,
        [tenantId, featureId, isEnabled, reason ?? null]
      );
      const r = await pool.query<Row>(
        `${SELECT_WITH_CONTEXT} WHERE o.id = $1`,
        [upserted.rows[0].id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(400).json({
          success: false,
          error: "Invalid tenantId or featureId",
        } as ApiResponse);
        return;
      }
      console.error("TenantFeatureOverridesController.upsertByPair error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async removeById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(
        `DELETE FROM pricing_tenant_feature_overrides WHERE id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Override not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      console.error("TenantFeatureOverridesController.removeById error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async removeByPair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId, featureId } = req.query as Record<string, string>;
      if (!tenantId || !featureId) {
        res.status(400).json({
          success: false,
          error: "tenantId and featureId query params are required",
        } as ApiResponse);
        return;
      }
      const r = await pool.query(
        `DELETE FROM pricing_tenant_feature_overrides
         WHERE tenant_id = $1 AND feature_id = $2`,
        [tenantId, featureId]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Override not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { tenantId, featureId } } as ApiResponse);
    } catch (err: any) {
      console.error("TenantFeatureOverridesController.removeByPair error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
