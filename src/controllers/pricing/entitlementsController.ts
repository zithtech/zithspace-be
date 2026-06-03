import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { EntitlementService } from "@/services/pricing/EntitlementService";

export class EntitlementsController {
  // GET /api/pricing/entitlements/me — the calling tenant's full resolved entitlements.
  // Useful for the FE to know which features to render / gate.
  static async getMine(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(401).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }
      const skipCache = req.query.fresh === "true";
      const data = await EntitlementService.getAllForTenant(req.tenantId, { skipCache });
      res.json({ success: true, data } as ApiResponse);
    } catch (err: any) {
      console.error("EntitlementsController.getMine error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  // GET /api/pricing/entitlements/tenant/:tenantId — admin view of any tenant.
  // TODO(pricing): when requirePlatformAdmin exists, gate this route with it.
  static async getForTenant(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.params;
      const skipCache = req.query.fresh === "true";
      const data = await EntitlementService.getAllForTenant(tenantId, { skipCache });
      res.json({ success: true, data } as ApiResponse);
    } catch (err: any) {
      console.error("EntitlementsController.getForTenant error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }

  // POST /api/pricing/entitlements/invalidate-cache — admin tool. No args → clear all.
  static async invalidateCache(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.body ?? {};
      if (tenantId) {
        EntitlementService.invalidate(tenantId);
        res.json({ success: true, data: { invalidated: tenantId } } as ApiResponse);
      } else {
        EntitlementService.invalidateAll();
        res.json({ success: true, data: { invalidated: "all" } } as ApiResponse);
      }
    } catch (err: any) {
      console.error("EntitlementsController.invalidateCache error:", err);
      res.status(500).json({ success: false, error: err.message } as ApiResponse);
    }
  }
}
