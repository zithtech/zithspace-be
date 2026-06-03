import { Response, NextFunction } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { EntitlementService } from "@/services/pricing/EntitlementService";

/**
 * Gate a route on a feature being entitled for the tenant.
 *
 *   router.post("/sprint-ai/generate", requireFeature("SPRINT_AI"), handler);
 */
export function requireFeature(featureCode: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.tenantId) {
      res.status(401).json({
        success: false,
        error: "Tenant context required",
      } as ApiResponse);
      return;
    }
    try {
      const ok = await EntitlementService.hasFeature(req.tenantId, featureCode);
      if (!ok) {
        res.status(403).json({
          success: false,
          error: `Feature ${featureCode} is not entitled for this tenant`,
          code: "FEATURE_NOT_ENTITLED",
        } as ApiResponse);
        return;
      }
      next();
    } catch (err: any) {
      console.error("requireFeature error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to check entitlement",
      } as ApiResponse);
    }
  };
}

/**
 * Check a tenant is below a limit before letting them perform an action.
 * Pass a function that returns the current usage (count) — kept generic so the
 * caller decides what "current" means (a COUNT(*), a Redis counter, etc.).
 *
 *   router.post(
 *     "/users",
 *     withinLimit("USERS", async (req) => {
 *       const r = await pool.query("SELECT COUNT(*)::int AS c FROM users WHERE tenant_id=$1", [req.tenantId]);
 *       return r.rows[0].c;
 *     }),
 *     handler
 *   );
 */
export function withinLimit(
  limitCode: string,
  getCurrentUsage: (req: AuthRequest) => Promise<number>
) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.tenantId) {
      res.status(401).json({
        success: false,
        error: "Tenant context required",
      } as ApiResponse);
      return;
    }
    try {
      const limit = await EntitlementService.getLimit(req.tenantId, limitCode);
      if (!limit) {
        // No limit defined → policy choice. Be conservative and refuse rather
        // than silently allowing — operators can add the limit explicitly.
        res.status(403).json({
          success: false,
          error: `Limit ${limitCode} not configured for this tenant`,
          code: "LIMIT_NOT_CONFIGURED",
        } as ApiResponse);
        return;
      }
      if (limit.isUnlimited) {
        next();
        return;
      }
      const current = await getCurrentUsage(req);
      const cap = limit.numeric ?? 0;
      if (current >= cap) {
        res.status(403).json({
          success: false,
          error: `Limit reached for ${limitCode}: ${current} / ${cap}`,
          code: "LIMIT_REACHED",
          limit: {
            code: limit.code,
            value: limit.value,
            numeric: limit.numeric,
            current,
          },
        } as ApiResponse);
        return;
      }
      next();
    } catch (err: any) {
      console.error("withinLimit error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to check limit",
      } as ApiResponse);
    }
  };
}
