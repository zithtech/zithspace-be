import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

const CURRENCY_RE = /^[A-Z]{3}$/;
const ALLOWED_STATUS = new Set([
  "pending",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);
const ACTIVE_STATUSES = new Set(["pending", "trialing", "active", "past_due"]);

type SubRow = {
  id: string;
  tenant_id: string;
  plan_variant_id: string;
  plan_variant_price_id: string | null;
  currency_code: string;
  amount: string;
  discount_amount: string;
  tax_amount: string;
  final_amount: string;
  status: string;
  starts_at: Date;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
  tenant_name?: string | null;
  tenant_subdomain?: string | null;
  variant_code?: string | null;
  variant_name?: string | null;
  billing_cycle?: string | null;
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
};

const mapRow = (r: SubRow) => ({
  id: r.id,
  tenantId: r.tenant_id,
  tenantName: r.tenant_name ?? null,
  tenantSubdomain: r.tenant_subdomain ?? null,
  planVariantId: r.plan_variant_id,
  planVariantPriceId: r.plan_variant_price_id,
  variantCode: r.variant_code ?? null,
  variantName: r.variant_name ?? null,
  billingCycle: r.billing_cycle ?? null,
  planId: r.plan_id ?? null,
  planCode: r.plan_code ?? null,
  planName: r.plan_name ?? null,
  currencyCode: r.currency_code,
  amount: Number(r.amount),
  discountAmount: Number(r.discount_amount),
  taxAmount: Number(r.tax_amount),
  finalAmount: Number(r.final_amount),
  status: r.status,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_WITH_CONTEXT = `
  SELECT s.*,
         t.name AS tenant_name, t.subdomain AS tenant_subdomain,
         v.code AS variant_code, v.name AS variant_name, v.billing_cycle, v.plan_id,
         p.code AS plan_code, p.name AS plan_name
  FROM pricing_subscriptions s
  LEFT JOIN tenants t ON t.id = s.tenant_id
  LEFT JOIN pricing_plan_variants v ON v.id = s.plan_variant_id
  LEFT JOIN pricing_plans p ON p.id = v.plan_id
`;

function parseAmount(v: any): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("amount must be a non-negative number");
  }
  return Math.round(n * 100) / 100;
}

export class SubscriptionsController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        tenantId,
        planId,
        planVariantId,
        search,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (status && ALLOWED_STATUS.has(status)) {
        params.push(status);
        conditions.push(`s.status = $${params.length}`);
      }
      if (tenantId) {
        params.push(tenantId);
        conditions.push(`s.tenant_id = $${params.length}`);
      }
      if (planId) {
        params.push(planId);
        conditions.push(`v.plan_id = $${params.length}`);
      }
      if (planVariantId) {
        params.push(planVariantId);
        conditions.push(`s.plan_variant_id = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        conditions.push(
          `(t.name ILIKE $${i} OR t.subdomain ILIKE $${i} OR v.code ILIKE $${i})`
        );
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query<SubRow>(
          `${SELECT_WITH_CONTEXT}
           ${where}
           ORDER BY s.created_at DESC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM pricing_subscriptions s
           LEFT JOIN tenants t ON t.id = s.tenant_id
           LEFT JOIN pricing_plan_variants v ON v.id = s.plan_variant_id
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
      console.error("SubscriptionsController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query<SubRow>(
        `${SELECT_WITH_CONTEXT} WHERE s.id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Subscription not found" } as ApiResponse);
        return;
      }
      const sub = mapRow(r.rows[0]);
      const [feats, lims] = await Promise.all([
        pool.query(
          `SELECT id, feature_id, feature_code, snapshotted_at
           FROM pricing_subscription_features WHERE subscription_id = $1
           ORDER BY feature_code ASC`,
          [id]
        ),
        pool.query(
          `SELECT sl.id, sl.limit_id, sl.limit_code, sl.limit_value, sl.snapshotted_at,
                  l.unit AS limit_unit, l.name AS limit_name
           FROM pricing_subscription_limits sl
           LEFT JOIN pricing_limits_catalog l ON l.id = sl.limit_id
           WHERE sl.subscription_id = $1
           ORDER BY sl.limit_code ASC`,
          [id]
        ),
      ]);
      res.json({
        success: true,
        data: {
          ...sub,
          features: feats.rows.map((f: any) => ({
            id: f.id,
            featureId: f.feature_id,
            featureCode: f.feature_code,
            snapshottedAt: f.snapshotted_at,
          })),
          limits: lims.rows.map((l: any) => ({
            id: l.id,
            limitId: l.limit_id,
            limitCode: l.limit_code,
            limitName: l.limit_name,
            limitUnit: l.limit_unit,
            limitValue: l.limit_value,
            snapshottedAt: l.snapshotted_at,
          })),
        },
      } as ApiResponse);
    } catch (err: any) {
      console.error("SubscriptionsController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  /**
   * Create a subscription:
   *  - Resolves price from pricing_plan_variant_prices(variantId, currencyCode)
   *  - Snapshots pricing_plan_features (joined via variant.plan_id) and
   *    pricing_plan_limits (joined via variant_id) in a transaction
   *  - Refuses if tenant already has an active/trialing/pending/past_due sub
   *    (the partial unique index also enforces this at DB level)
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const client = await pool.connect();
    try {
      const {
        tenantId,
        planVariantId,
        currencyCode,
        discountAmount,
        taxAmount,
        startsAt,
        status,
      } = req.body ?? {};

      if (!tenantId || !planVariantId || !currencyCode) {
        res.status(400).json({
          success: false,
          error: "tenantId, planVariantId and currencyCode are required",
        } as ApiResponse);
        return;
      }
      if (!CURRENCY_RE.test(currencyCode)) {
        res.status(400).json({
          success: false,
          error: "currencyCode must be a 3-letter ISO code",
        } as ApiResponse);
        return;
      }
      const stRaw = status ?? "active";
      if (!ALLOWED_STATUS.has(stRaw)) {
        res.status(400).json({ success: false, error: "invalid status" } as ApiResponse);
        return;
      }

      let discount: number;
      let tax: number;
      try {
        discount = parseAmount(discountAmount);
        tax = parseAmount(taxAmount);
      } catch (e: any) {
        res.status(400).json({ success: false, error: e.message } as ApiResponse);
        return;
      }

      await client.query("BEGIN");

      // Resolve the variant + price
      const priceResult = await client.query<{
        id: string;
        base_price: string;
      }>(
        `SELECT id, base_price
         FROM pricing_plan_variant_prices
         WHERE plan_variant_id = $1 AND currency_code = $2 AND status = 'active'
         LIMIT 1`,
        [planVariantId, currencyCode]
      );
      if (!priceResult.rowCount) {
        await client.query("ROLLBACK");
        res.status(400).json({
          success: false,
          error: `No active price for variant ${planVariantId} in currency ${currencyCode}`,
        } as ApiResponse);
        return;
      }
      const amount = Number(priceResult.rows[0].base_price);
      const final_amount = Math.max(0, Math.round((amount - discount + tax) * 100) / 100);

      // Insert subscription
      let subId: string;
      try {
        const subResult = await client.query<{ id: string }>(
          `INSERT INTO pricing_subscriptions
             (tenant_id, plan_variant_id, plan_variant_price_id, currency_code,
              amount, discount_amount, tax_amount, final_amount,
              status, starts_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()))
           RETURNING id`,
          [
            tenantId,
            planVariantId,
            priceResult.rows[0].id,
            currencyCode,
            amount,
            discount,
            tax,
            final_amount,
            stRaw,
            startsAt ?? null,
          ]
        );
        subId = subResult.rows[0].id;
      } catch (e: any) {
        await client.query("ROLLBACK");
        if (e.code === "23505") {
          res.status(409).json({
            success: false,
            error:
              "Tenant already has an active subscription. Use change-plan to switch plans.",
          } as ApiResponse);
          return;
        }
        if (e.code === "23503") {
          res.status(400).json({
            success: false,
            error: "Invalid tenantId or planVariantId",
          } as ApiResponse);
          return;
        }
        throw e;
      }

      // Snapshot features
      await client.query(
        `INSERT INTO pricing_subscription_features (subscription_id, feature_id, feature_code)
         SELECT $1, pf.feature_id, f.code
         FROM pricing_plan_features pf
         JOIN pricing_features f ON f.id = pf.feature_id
         WHERE pf.plan_id = (SELECT plan_id FROM pricing_plan_variants WHERE id = $2)`,
        [subId, planVariantId]
      );

      // Snapshot limits
      await client.query(
        `INSERT INTO pricing_subscription_limits (subscription_id, limit_id, limit_code, limit_value)
         SELECT $1, pl.limit_id, l.code, pl.limit_value
         FROM pricing_plan_limits pl
         JOIN pricing_limits_catalog l ON l.id = pl.limit_id
         WHERE pl.plan_variant_id = $2`,
        [subId, planVariantId]
      );

      await client.query("COMMIT");

      // Re-fetch with context
      const r = await pool.query<SubRow>(
        `${SELECT_WITH_CONTEXT} WHERE s.id = $1`,
        [subId]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("SubscriptionsController.create error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    } finally {
      client.release();
    }
  }

  /**
   * Atomically close the current active subscription for a tenant and create
   * a new one with snapshots. No mutation of the old row — full audit trail.
   */
  static async changePlan(req: AuthRequest, res: Response): Promise<void> {
    const client = await pool.connect();
    try {
      const {
        tenantId,
        planVariantId,
        currencyCode,
        discountAmount,
        taxAmount,
      } = req.body ?? {};

      if (!tenantId || !planVariantId || !currencyCode) {
        res.status(400).json({
          success: false,
          error: "tenantId, planVariantId and currencyCode are required",
        } as ApiResponse);
        return;
      }
      if (!CURRENCY_RE.test(currencyCode)) {
        res.status(400).json({
          success: false,
          error: "currencyCode must be a 3-letter ISO code",
        } as ApiResponse);
        return;
      }

      let discount: number;
      let tax: number;
      try {
        discount = parseAmount(discountAmount);
        tax = parseAmount(taxAmount);
      } catch (e: any) {
        res.status(400).json({ success: false, error: e.message } as ApiResponse);
        return;
      }

      await client.query("BEGIN");

      // Resolve price first (cheap fail before closing current sub)
      const priceResult = await client.query<{ id: string; base_price: string }>(
        `SELECT id, base_price FROM pricing_plan_variant_prices
         WHERE plan_variant_id = $1 AND currency_code = $2 AND status = 'active'
         LIMIT 1`,
        [planVariantId, currencyCode]
      );
      if (!priceResult.rowCount) {
        await client.query("ROLLBACK");
        res.status(400).json({
          success: false,
          error: `No active price for variant ${planVariantId} in currency ${currencyCode}`,
        } as ApiResponse);
        return;
      }
      const amount = Number(priceResult.rows[0].base_price);
      const final_amount = Math.max(0, Math.round((amount - discount + tax) * 100) / 100);

      // Close current active sub (if any)
      await client.query(
        `UPDATE pricing_subscriptions
         SET status = 'canceled', ends_at = NOW()
         WHERE tenant_id = $1 AND status IN ('pending','trialing','active','past_due')`,
        [tenantId]
      );

      // Insert new sub
      const subResult = await client.query<{ id: string }>(
        `INSERT INTO pricing_subscriptions
           (tenant_id, plan_variant_id, plan_variant_price_id, currency_code,
            amount, discount_amount, tax_amount, final_amount,
            status, starts_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
         RETURNING id`,
        [
          tenantId,
          planVariantId,
          priceResult.rows[0].id,
          currencyCode,
          amount,
          discount,
          tax,
          final_amount,
        ]
      );
      const subId = subResult.rows[0].id;

      // Snapshot
      await client.query(
        `INSERT INTO pricing_subscription_features (subscription_id, feature_id, feature_code)
         SELECT $1, pf.feature_id, f.code
         FROM pricing_plan_features pf
         JOIN pricing_features f ON f.id = pf.feature_id
         WHERE pf.plan_id = (SELECT plan_id FROM pricing_plan_variants WHERE id = $2)`,
        [subId, planVariantId]
      );
      await client.query(
        `INSERT INTO pricing_subscription_limits (subscription_id, limit_id, limit_code, limit_value)
         SELECT $1, pl.limit_id, l.code, pl.limit_value
         FROM pricing_plan_limits pl
         JOIN pricing_limits_catalog l ON l.id = pl.limit_id
         WHERE pl.plan_variant_id = $2`,
        [subId, planVariantId]
      );

      await client.query("COMMIT");

      const r = await pool.query<SubRow>(
        `${SELECT_WITH_CONTEXT} WHERE s.id = $1`,
        [subId]
      );
      res.status(201).json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("SubscriptionsController.changePlan error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    } finally {
      client.release();
    }
  }

  static async cancel(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_subscriptions
         SET status = 'canceled', ends_at = COALESCE(ends_at, NOW())
         WHERE id = $1
         RETURNING id`,
        [id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Subscription not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<SubRow>(
        `${SELECT_WITH_CONTEXT} WHERE s.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("SubscriptionsController.cancel error:", err);
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
      // If moving to a terminal status and ends_at is null, set it.
      const setEndsAt = ["canceled", "expired"].includes(status);
      const upd = await pool.query<{ id: string }>(
        `UPDATE pricing_subscriptions
         SET status = $1,
             ends_at = CASE WHEN $2::boolean AND ends_at IS NULL THEN NOW() ELSE ends_at END
         WHERE id = $3
         RETURNING id`,
        [status, setEndsAt, id]
      );
      if (!upd.rowCount) {
        res.status(404).json({ success: false, error: "Subscription not found" } as ApiResponse);
        return;
      }
      const r = await pool.query<SubRow>(
        `${SELECT_WITH_CONTEXT} WHERE s.id = $1`,
        [id]
      );
      res.json({ success: true, data: mapRow(r.rows[0]) } as ApiResponse);
    } catch (err: any) {
      console.error("SubscriptionsController.setStatus error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
