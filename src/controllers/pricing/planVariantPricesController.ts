import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const CURRENCY_RE = /^[A-Z]{3}$/;
const ALLOWED_STATUS = new Set(["active", "archived"]);

type PriceRow = {
  id: string;
  plan_variant_id: string;
  currency_code: string;
  base_price: string; // NUMERIC comes back as string from pg
  setup_fee: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  variant_code?: string | null;
  variant_name?: string | null;
  billing_cycle?: string | null;
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
};

const mapRow = (r: PriceRow) => ({
  id: r.id,
  planVariantId: r.plan_variant_id,
  variantCode: r.variant_code ?? null,
  variantName: r.variant_name ?? null,
  billingCycle: r.billing_cycle ?? null,
  planId: r.plan_id ?? null,
  planCode: r.plan_code ?? null,
  planName: r.plan_name ?? null,
  currencyCode: r.currency_code,
  basePrice: Number(r.base_price),
  setupFee: Number(r.setup_fee),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT pr.*,
         v.code AS variant_code, v.name AS variant_name, v.billing_cycle, v.plan_id,
         p.code AS plan_code, p.name AS plan_name
  FROM pricing_plan_variant_prices pr
  LEFT JOIN pricing_plan_variants v ON v.id = pr.plan_variant_id
  LEFT JOIN pricing_plans p ON p.id = v.plan_id
`;

function parseAmount(v: any, field: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  // 2 decimal places — let DB enforce final precision, but reject obviously wrong inputs
  return Math.round(n * 100) / 100;
}

export class PlanVariantPricesController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        planVariantId,
        planId,
        currencyCode,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`pr.status = $${params.length}`);
      }
      if (planVariantId) {
        params.push(planVariantId);
        conditions.push(`pr.plan_variant_id = $${params.length}`);
      }
      if (planId) {
        params.push(planId);
        conditions.push(`v.plan_id = $${params.length}`);
      }
      if (currencyCode && CURRENCY_RE.test(currencyCode)) {
        params.push(currencyCode);
        conditions.push(`pr.currency_code = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<PriceRow>(
          `${SELECT_WITH_CONTEXT}
           ${where}
           ORDER BY v.plan_id ASC, v.billing_cycle ASC, pr.currency_code ASC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM pricing_plan_variant_prices pr
           LEFT JOIN pricing_plan_variants v ON v.id = pr.plan_variant_id
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
      console.error("PlanVariantPricesController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<PriceRow>(
        `${SELECT_WITH_CONTEXT} WHERE pr.id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Price not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("PlanVariantPricesController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { planVariantId, currencyCode, basePrice, setupFee, status } = req.body ?? {};

      if (!planVariantId) {
        res.status(400).json({ success: false, error: "planVariantId is required" } as ApiResponse);
        return;
      }
      if (!currencyCode || typeof currencyCode !== "string" || !CURRENCY_RE.test(currencyCode)) {
        res.status(400).json({
          success: false,
          error: "currencyCode must be a 3-letter ISO code (e.g. USD, INR)",
        } as ApiResponse);
        return;
      }
      let base: number;
      let setup: number;
      try {
        const b = parseAmount(basePrice, "basePrice");
        if (b === null) {
          res.status(400).json({ success: false, error: "basePrice is required" } as ApiResponse);
          return;
        }
        base = b;
        setup = parseAmount(setupFee, "setupFee") ?? 0;
      } catch (e: any) {
        res.status(400).json({ success: false, error: e.message } as ApiResponse);
        return;
      }
      const st = status && ALLOWED_STATUS.has(status) ? status : "active";

      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO pricing_plan_variant_prices
           (plan_variant_id, currency_code, base_price, setup_fee, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [planVariantId, currencyCode, base, setup, st]
      );
      const r = await pool.query<PriceRow>(
        `${SELECT_WITH_CONTEXT} WHERE pr.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({
          success: false,
          error: "A price for this variant in this currency already exists",
        } as ApiResponse);
        return;
      }
      if (err.code === "23503") {
        res.status(400).json({ success: false, error: "Invalid planVariantId" } as ApiResponse);
        return;
      }
      console.error("PlanVariantPricesController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { currencyCode, basePrice, setupFee, status } = req.body ?? {};
      // Note: planVariantId not editable — moving a price across variants doesn't make sense.

      const sets: string[] = [];
      const params: any[] = [];

      if (currencyCode !== undefined) {
        if (typeof currencyCode !== "string" || !CURRENCY_RE.test(currencyCode)) {
          res.status(400).json({
            success: false,
            error: "currencyCode must be a 3-letter ISO code",
          } as ApiResponse);
          return;
        }
        params.push(currencyCode);
        sets.push(`currency_code = $${params.length}`);
      }
      if (basePrice !== undefined) {
        try {
          const b = parseAmount(basePrice, "basePrice");
          if (b === null) {
            res.status(400).json({ success: false, error: "basePrice cannot be null" } as ApiResponse);
            return;
          }
          params.push(b);
          sets.push(`base_price = $${params.length}`);
        } catch (e: any) {
          res.status(400).json({ success: false, error: e.message } as ApiResponse);
          return;
        }
      }
      if (setupFee !== undefined) {
        try {
          const s = parseAmount(setupFee, "setupFee") ?? 0;
          params.push(s);
          sets.push(`setup_fee = $${params.length}`);
        } catch (e: any) {
          res.status(400).json({ success: false, error: e.message } as ApiResponse);
          return;
        }
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
        `UPDATE pricing_plan_variant_prices SET ${sets.join(", ")}
         WHERE id = $${params.length}
         RETURNING id`,
        params
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Price not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<PriceRow>(
        `${SELECT_WITH_CONTEXT} WHERE pr.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      if (err.code === "23505") {
        res.status(409).json({
          success: false,
          error: "A price for this variant in this currency already exists",
        } as ApiResponse);
        return;
      }
      console.error("PlanVariantPricesController.update error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async archive(req: AuthRequest, res: Response): Promise<void> {
    return PlanVariantPricesController.setStatus(req, res, "archived");
  }
  static async restore(req: AuthRequest, res: Response): Promise<void> {
    return PlanVariantPricesController.setStatus(req, res, "active");
  }

  private static async setStatus(req: AuthRequest, res: Response, status: string): Promise<void> {
    try {
      const { id } = req.params;
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_plan_variant_prices SET status = $1 WHERE id = $2 RETURNING id`,
        [status, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Price not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<PriceRow>(
        `${SELECT_WITH_CONTEXT} WHERE pr.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("PlanVariantPricesController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(`DELETE FROM pricing_plan_variant_prices WHERE id = $1`, [id]);
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Price not found" } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse);
    } catch (err: any) {
      console.error("PlanVariantPricesController.remove error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
