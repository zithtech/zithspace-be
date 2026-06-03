import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const ALLOWED_STATUS = new Set(["pending", "active", "canceled", "expired"]);

type TenantAddonRow = {
  id: string;
  tenant_id: string;
  addon_id: string | null;
  addon_code: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  currency_code: string;
  status: string;
  starts_at: Date;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // joined
  addon_name?: string | null;
  addon_type?: string | null;
  feature_code?: string | null;
  feature_name?: string | null;
  limit_code?: string | null;
  limit_name?: string | null;
  limit_unit?: string | null;
  tenant_name?: string | null;
  tenant_subdomain?: string | null;
};

const mapRow = (r: TenantAddonRow) => ({
  id: r.id,
  tenantId: r.tenant_id,
  tenantName: r.tenant_name ?? null,
  tenantSubdomain: r.tenant_subdomain ?? null,
  addonId: r.addon_id,
  addonCode: r.addon_code,
  addonName: r.addon_name ?? null,
  addonType: r.addon_type ?? null,
  featureCode: r.feature_code ?? null,
  featureName: r.feature_name ?? null,
  limitCode: r.limit_code ?? null,
  limitName: r.limit_name ?? null,
  limitUnit: r.limit_unit ?? null,
  quantity: r.quantity,
  unitPrice: Number(r.unit_price),
  totalPrice: Number(r.total_price),
  currencyCode: r.currency_code,
  status: r.status,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT ta.*,
         t.name AS tenant_name, t.subdomain AS tenant_subdomain,
         a.name AS addon_name, a.addon_type,
         f.code AS feature_code, f.name AS feature_name,
         l.code AS limit_code, l.name AS limit_name, l.unit AS limit_unit
  FROM pricing_tenant_addons ta
  LEFT JOIN tenants t ON t.id = ta.tenant_id
  LEFT JOIN pricing_addons a ON a.id = ta.addon_id
  LEFT JOIN pricing_features f ON f.id = a.feature_id
  LEFT JOIN pricing_limits_catalog l ON l.id = a.limit_id
`;

export class TenantAddonsController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        tenantId,
        addonId,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`ta.status = $${params.length}`);
      }
      if (tenantId) {
        params.push(tenantId);
        conditions.push(`ta.tenant_id = $${params.length}`);
      }
      if (addonId) {
        params.push(addonId);
        conditions.push(`ta.addon_id = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<TenantAddonRow>(
          `${SELECT_WITH_CONTEXT}
           ${where}
           ORDER BY ta.created_at DESC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pricing_tenant_addons ta ${where}`,
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
      console.error("TenantAddonsController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<TenantAddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE ta.id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Tenant addon not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("TenantAddonsController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  /**
   * Purchase an addon. Resolves addon's current code/price/currency and snapshots
   * them on the row so the purchase record is stable against future catalog edits.
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId, addonId, quantity, startsAt, status } = req.body ?? {};

      if (!tenantId || !addonId) {
        res.status(400).json({
          success: false,
          error: "tenantId and addonId are required",
        } as ApiResponse);
        return;
      }
      const qty = quantity === undefined || quantity === null ? 1 : Number(quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        res.status(400).json({
          success: false,
          error: "quantity must be a positive integer",
        } as ApiResponse);
        return;
      }
      const stRaw = status ?? "active";
      if (!ALLOWED_STATUS.has(stRaw)) {
        res.status(400).json({ success: false, error: "invalid status" } as ApiResponse);
        return;
      }

      // Snapshot addon data
      const addonResult = await pool.query<{
        code: string;
        price: string;
        currency_code: string;
        status: string;
        addon_type: string;
      }>(
        `SELECT code, price, currency_code, status, addon_type
         FROM pricing_addons WHERE id = $1`,
        [addonId]
      );
      if (!addonResult.rowCount) {
        res.status(400).json({ success: false, error: "Addon not found" } as ApiResponse);
        return;
      }
      const addon = addonResult.rows[0];
      if (addon.status !== "active") {
        res.status(400).json({
          success: false,
          error: "Cannot purchase an archived addon",
        } as ApiResponse);
        return;
      }
      // For FEATURE addons, quantity > 1 doesn't make semantic sense (you either have it or not).
      if (addon.addon_type === "FEATURE" && qty !== 1) {
        res.status(400).json({
          success: false,
          error: "FEATURE addons must be purchased with quantity = 1",
        } as ApiResponse);
        return;
      }
      const unitPrice = Number(addon.price);
      const totalPrice = Math.round(unitPrice * qty * 100) / 100;

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_tenant_addons
           (tenant_id, addon_id, addon_code, quantity, unit_price, total_price,
            currency_code, status, starts_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
         RETURNING id`,
        [
          tenantId,
          addonId,
          addon.code,
          qty,
          unitPrice,
          totalPrice,
          addon.currency_code,
          stRaw,
          startsAt ?? null,
        ]
      );
      const r = await pool.query<TenantAddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE ta.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(400).json({
          success: false,
          error: "Invalid tenantId or addonId",
        } as ApiResponse);
        return;
      }
      console.error("TenantAddonsController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  /**
   * Update quantity (recomputes total). Other fields are immutable — the purchase
   * record should reflect what was actually bought.
   */
  static async updateQuantity(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { quantity } = req.body ?? {};
      const qty = Number(quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        res.status(400).json({
          success: false,
          error: "quantity must be a positive integer",
        } as ApiResponse);
        return;
      }

      // Need current unit_price to recompute total
      const cur = await pool.query<{ unit_price: string; status: string; addon_type: string | null }>(
        `SELECT ta.unit_price, ta.status, a.addon_type
         FROM pricing_tenant_addons ta
         LEFT JOIN pricing_addons a ON a.id = ta.addon_id
         WHERE ta.id = $1`,
        [id]
      );
      if (!cur.rowCount) {
        res.status(404).json({ success: false, error: "Tenant addon not found" } as ApiResponse);
        return;
      }
      if (cur.rows[0].status === "canceled" || cur.rows[0].status === "expired") {
        res.status(400).json({
          success: false,
          error: "Cannot update a canceled / expired purchase",
        } as ApiResponse);
        return;
      }
      if (cur.rows[0].addon_type === "FEATURE" && qty !== 1) {
        res.status(400).json({
          success: false,
          error: "FEATURE addons must keep quantity = 1",
        } as ApiResponse);
        return;
      }
      const unitPrice = Number(cur.rows[0].unit_price);
      const totalPrice = Math.round(unitPrice * qty * 100) / 100;

      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_tenant_addons
         SET quantity = $1, total_price = $2
         WHERE id = $3
         RETURNING id`,
        [qty, totalPrice, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Tenant addon not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<TenantAddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE ta.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("TenantAddonsController.updateQuantity error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async cancel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_tenant_addons
         SET status = 'canceled', ends_at = COALESCE(ends_at, NOW())
         WHERE id = $1
         RETURNING id`,
        [id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Tenant addon not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<TenantAddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE ta.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("TenantAddonsController.cancel error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async setStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body ?? {};
      if (!status || !ALLOWED_STATUS.has(status)) {
        res.status(400).json({ success: false, error: "invalid status" } as ApiResponse);
        return;
      }
      const setEndsAt = ["canceled", "expired"].includes(status);
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_tenant_addons
         SET status = $1,
             ends_at = CASE WHEN $2::boolean AND ends_at IS NULL THEN NOW() ELSE ends_at END
         WHERE id = $3
         RETURNING id`,
        [status, setEndsAt, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Tenant addon not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<TenantAddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE ta.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("TenantAddonsController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  // Hard delete — for cleaning up pending/cancelled rows. Don't delete completed
  // purchases that affect entitlements.
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(
        `DELETE FROM pricing_tenant_addons
         WHERE id = $1 AND status IN ('pending','canceled','expired')`,
        [id]
      );
      if (!r.rowCount) {
        res.status(409).json({
          success: false,
          error: "Tenant addon not found or still active. Cancel it first.",
        } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      console.error("TenantAddonsController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
