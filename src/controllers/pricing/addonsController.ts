import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const ALLOWED_STATUS = new Set(["active", "archived"]);
const ALLOWED_TYPES = new Set(["FEATURE", "LIMIT_EXTENSION"]);
const ALLOWED_CYCLES = new Set(["MONTHLY", "QUARTERLY", "YEARLY", "ONE_TIME"]);

type AddonRow = {
  id: string;
  feature_id: string | null;
  limit_id: string | null;
  code: string;
  name: string;
  addon_type: string;
  billing_cycle: string;
  price: string;
  currency_code: string;
  status: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  feature_code?: string | null;
  feature_name?: string | null;
  feature_type_grant?: string | null;
  limit_code?: string | null;
  limit_name?: string | null;
  limit_unit?: string | null;
};

const mapRow = (r: AddonRow) => ({
  id: r.id,
  featureId: r.feature_id,
  featureCode: r.feature_code ?? null,
  featureName: r.feature_name ?? null,
  featureType: r.feature_type_grant ?? null,
  limitId: r.limit_id,
  limitCode: r.limit_code ?? null,
  limitName: r.limit_name ?? null,
  limitUnit: r.limit_unit ?? null,
  code: r.code,
  name: r.name,
  addonType: r.addon_type,
  billingCycle: r.billing_cycle,
  price: Number(r.price),
  currencyCode: r.currency_code,
  status: r.status,
  description: r.description,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT a.*,
         f.code AS feature_code, f.name AS feature_name, f.feature_type AS feature_type_grant,
         l.code AS limit_code,  l.name AS limit_name,  l.unit AS limit_unit
  FROM pricing_addons a
  LEFT JOIN pricing_features f ON f.id = a.feature_id
  LEFT JOIN pricing_limits_catalog l ON l.id = a.limit_id
`;

function parsePrice(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export class AddonsController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        addonType,
        currencyCode,
        billingCycle,
        search,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`a.status = $${params.length}`);
      }
      if (addonType && ALLOWED_TYPES.has(addonType)) {
        params.push(addonType);
        conditions.push(`a.addon_type = $${params.length}`);
      }
      if (currencyCode && CURRENCY_RE.test(currencyCode)) {
        params.push(currencyCode);
        conditions.push(`a.currency_code = $${params.length}`);
      }
      if (billingCycle && ALLOWED_CYCLES.has(billingCycle)) {
        params.push(billingCycle);
        conditions.push(`a.billing_cycle = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        conditions.push(`(a.name ILIKE $${i} OR a.code ILIKE $${i})`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<AddonRow>(
          `${SELECT_WITH_CONTEXT}
           ${where}
           ORDER BY a.addon_type ASC, a.name ASC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM pricing_addons a ${where}`,
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
      console.error("AddonsController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<AddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE a.id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Addon not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("AddonsController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        code,
        name,
        addonType,
        featureId,
        limitId,
        billingCycle,
        price,
        currencyCode,
        description,
        status,
      } = req.body ?? {};

      if (!code || typeof code !== "string" || !CODE_RE.test(code)) {
        res.status(400).json({
          success: false,
          error: "code must be UPPER_SNAKE_CASE (e.g. EXTRA_USERS)",
        } as ApiResponse);
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ success: false, error: "name is required" } as ApiResponse);
        return;
      }
      if (!addonType || !ALLOWED_TYPES.has(addonType)) {
        res.status(400).json({
          success: false,
          error: `addonType must be one of: ${Array.from(ALLOWED_TYPES).join(", ")}`,
        } as ApiResponse);
        return;
      }
      if (addonType === "FEATURE" && !featureId) {
        res.status(400).json({
          success: false,
          error: "featureId is required when addonType is FEATURE",
        } as ApiResponse);
        return;
      }
      if (addonType === "LIMIT_EXTENSION" && !limitId) {
        res.status(400).json({
          success: false,
          error: "limitId is required when addonType is LIMIT_EXTENSION",
        } as ApiResponse);
        return;
      }
      if (!billingCycle || !ALLOWED_CYCLES.has(billingCycle)) {
        res.status(400).json({
          success: false,
          error: `billingCycle must be one of: ${Array.from(ALLOWED_CYCLES).join(", ")}`,
        } as ApiResponse);
        return;
      }
      const priceNum = parsePrice(price);
      if (priceNum === null) {
        res.status(400).json({
          success: false,
          error: "price must be a non-negative number",
        } as ApiResponse);
        return;
      }
      if (!currencyCode || !CURRENCY_RE.test(currencyCode)) {
        res.status(400).json({
          success: false,
          error: "currencyCode must be a 3-letter ISO code",
        } as ApiResponse);
        return;
      }
      const st = status && ALLOWED_STATUS.has(status) ? status : "active";

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_addons
           (code, name, addon_type, feature_id, limit_id, billing_cycle,
            price, currency_code, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          code,
          name,
          addonType,
          addonType === "FEATURE" ? featureId : null,
          addonType === "LIMIT_EXTENSION" ? limitId : null,
          billingCycle,
          priceNum,
          currencyCode,
          description ?? null,
          st,
        ]
      );
      const r = await pool.query<AddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE a.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid featureId or limitId" } as ApiResponse);
        return;
      }
      if (err.code === "23514") {
        res.status(400).json({
          success: false,
          error: "Addon failed a validation check (see addon_type / feature_id / limit_id pairing)",
        } as ApiResponse);
        return;
      }
      console.error("AddonsController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        code,
        name,
        addonType,
        featureId,
        limitId,
        billingCycle,
        price,
        currencyCode,
        description,
        status,
      } = req.body ?? {};

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
      if (addonType !== undefined) {
        if (!ALLOWED_TYPES.has(addonType)) {
          res.status(400).json({ success: false, error: "invalid addonType" } as ApiResponse);
          return;
        }
        params.push(addonType);
        sets.push(`addon_type = $${params.length}`);
      }
      if (featureId !== undefined) {
        params.push(featureId);
        sets.push(`feature_id = $${params.length}`);
      }
      if (limitId !== undefined) {
        params.push(limitId);
        sets.push(`limit_id = $${params.length}`);
      }
      if (billingCycle !== undefined) {
        if (!ALLOWED_CYCLES.has(billingCycle)) {
          res.status(400).json({ success: false, error: "invalid billingCycle" } as ApiResponse);
          return;
        }
        params.push(billingCycle);
        sets.push(`billing_cycle = $${params.length}`);
      }
      if (price !== undefined) {
        const p = parsePrice(price);
        if (p === null) {
          res.status(400).json({ success: false, error: "price must be a non-negative number" } as ApiResponse);
          return;
        }
        params.push(p);
        sets.push(`price = $${params.length}`);
      }
      if (currencyCode !== undefined) {
        if (!CURRENCY_RE.test(currencyCode)) {
          res.status(400).json({
            success: false,
            error: "currencyCode must be a 3-letter ISO code",
          } as ApiResponse);
          return;
        }
        params.push(currencyCode);
        sets.push(`currency_code = $${params.length}`);
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
        `UPDATE pricing_addons SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING id`,
        params
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Addon not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<AddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE a.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({ success: false, error: "code already exists" } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid featureId or limitId" } as ApiResponse);
        return;
      }
      if (err.code === "23514") {
        res.status(400).json({
          success: false,
          error: "Addon failed a validation check (see addon_type / feature_id / limit_id pairing)",
        } as ApiResponse);
        return;
      }
      console.error("AddonsController.update error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async archive(req: AuthRequest, res: Response): Promise<void> {
    return AddonsController.setStatus(req, res, "archived");
  }
  static async restore(req: AuthRequest, res: Response): Promise<void> {
    return AddonsController.setStatus(req, res, "active");
  }

  private static async setStatus(req: AuthRequest, res: Response, status: string): Promise<void> {
    try {
      const { id } = req.params;
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_addons SET status = $1 WHERE id = $2 RETURNING id`,
        [status, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Addon not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<AddonRow>(
        `${SELECT_WITH_CONTEXT} WHERE a.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("AddonsController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_addons WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Addon not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23503") {
        res.status(409).json({
          success: false,
          error: "Cannot delete: addon has been purchased by tenants. Archive instead.",
        } as ApiResponse);
        return;
      }
      console.error("AddonsController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
