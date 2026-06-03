import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const UNLIMITED_SENTINEL = "UNLIMITED";

type Row = {
  id: string;
  tenant_id: string;
  limit_id: string;
  limit_value: string;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
  limit_code?: string | null;
  limit_name?: string | null;
  limit_unit?: string | null;
};

const mapRow = (r: Row) => ({
  id: r.id,
  tenantId: r.tenant_id,
  limitId: r.limit_id,
  limitCode: r.limit_code ?? null,
  limitName: r.limit_name ?? null,
  limitUnit: r.limit_unit ?? null,
  limitValue: r.limit_value,
  reason: r.reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT o.*,
         l.code AS limit_code, l.name AS limit_name, l.unit AS limit_unit
  FROM pricing_tenant_limit_overrides o
  LEFT JOIN pricing_limits_catalog l ON l.id = o.limit_id
`;

function validateLimitValue(v: any): { ok: true; value: string } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") {
    return { ok: false, error: "limitValue is required" };
  }
  const s = String(v).trim();
  if (s === UNLIMITED_SENTINEL) return { ok: true, value: s };
  if (!/^\d+$/.test(s)) {
    return { ok: false, error: 'limitValue must be a non-negative integer or "UNLIMITED"' };
  }
  return { ok: true, value: s };
}

export class TenantLimitOverridesController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId, limitId } = req.query as Record<string, string>;
      const conditions: string[] = [];
      const params: any[] = [];
      if (tenantId) {
        params.push(tenantId);
        conditions.push(`o.tenant_id = $${params.length}`);
      }
      if (limitId) {
        params.push(limitId);
        conditions.push(`o.limit_id = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const r = await pool.query<Row>(
        `${SELECT_WITH_CONTEXT} ${where} ORDER BY l.name ASC`,
        params
      );
      res.json({ success: true, data: r.rows.map(mapRow) } as ApiResponse);
    } catch (err: any) {
      console.error("TenantLimitOverridesController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async upsertByPair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId, limitId, limitValue, reason } = req.body ?? {};
      if (!tenantId || !limitId) {
        res.status(400).json({
          success: false,
          error: "tenantId and limitId are required",
        } as ApiResponse);
        return;
      }
      const v = validateLimitValue(limitValue);
      if ('error' in v) {
        res.status(400).json({ success: false, error: v.error } as ApiResponse);
        return;
      }
      const upserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_tenant_limit_overrides
           (tenant_id, limit_id, limit_value, reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, limit_id)
         DO UPDATE SET limit_value = EXCLUDED.limit_value, reason = EXCLUDED.reason
         RETURNING id`,
        [tenantId, limitId, v.value, reason ?? null]
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
          error: "Invalid tenantId or limitId",
        } as ApiResponse);
        return;
      }
      console.error("TenantLimitOverridesController.upsertByPair error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async removeById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(
        `DELETE FROM pricing_tenant_limit_overrides WHERE id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Override not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      console.error("TenantLimitOverridesController.removeById error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async removeByPair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId, limitId } = req.query as Record<string, string>;
      if (!tenantId || !limitId) {
        res.status(400).json({
          success: false,
          error: "tenantId and limitId query params are required",
        } as ApiResponse);
        return;
      }
      const r = await pool.query(
        `DELETE FROM pricing_tenant_limit_overrides
         WHERE tenant_id = $1 AND limit_id = $2`,
        [tenantId, limitId]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Override not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { tenantId, limitId } } as ApiResponse);
    } catch (err: any) {
      console.error("TenantLimitOverridesController.removeByPair error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
