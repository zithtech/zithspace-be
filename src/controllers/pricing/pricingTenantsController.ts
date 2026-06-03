import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest, ApiResponse } from "@/types";

// Lightweight tenants list for the pricing-and-plans admin UI (dropdowns + tenant detail).
// Does NOT replace the main /api/tenants endpoints. Stays under /api/pricing/tenants for clarity.
export class PricingTenantsController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 50,
        search,
        isActive,
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: any[] = [];

      if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        conditions.push(`(name ILIKE $${i} OR subdomain ILIKE $${i})`);
      }
      if (isActive === "true" || isActive === "false") {
        params.push(isActive === "true");
        conditions.push(`is_active = $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const pageNum = Math.max(1, Number(page) || 1);
      const lim = Math.min(200, Math.max(1, Number(limit) || 50));
      const offset = (pageNum - 1) * lim;

      const [rowsResult, countResult] = await Promise.all([
        pool.query(
          `SELECT id, name, subdomain, plan_type, is_active, is_trial, trial_ends_at, created_at
           FROM tenants
           ${where}
           ORDER BY name ASC
           LIMIT ${lim} OFFSET ${offset}`,
          params
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM tenants ${where}`,
          params
        ),
      ]);

      const total = Number(countResult.rows[0]?.count || 0);
      res.json({
        success: true,
        data: rowsResult.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          subdomain: r.subdomain,
          planType: r.plan_type,
          isActive: r.is_active,
          isTrial: r.is_trial,
          trialEndsAt: r.trial_ends_at,
          createdAt: r.created_at,
        })),
        pagination: {
          page: pageNum,
          limit: lim,
          total,
          pages: Math.ceil(total / lim) || 1,
        },
      } as ApiResponse);
    } catch (err: any) {
      console.error("PricingTenantsController.list error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const r = await pool.query(
        `SELECT id, name, subdomain, plan_type, is_active, is_trial, trial_ends_at,
                created_at, updated_at
         FROM tenants WHERE id = $1`,
        [id]
      );
      if (!r.rowCount) {
        res.status(404).json({ success: false, error: "Tenant not found" } as ApiResponse);
        return;
      }
      const t: any = r.rows[0];
      res.json({
        success: true,
        data: {
          id: t.id,
          name: t.name,
          subdomain: t.subdomain,
          planType: t.plan_type,
          isActive: t.is_active,
          isTrial: t.is_trial,
          trialEndsAt: t.trial_ends_at,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        },
      } as ApiResponse);
    } catch (err: any) {
      console.error("PricingTenantsController.get error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
