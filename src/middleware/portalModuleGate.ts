import { Request, Response, NextFunction } from "express";
import { isModuleEnabled } from "@/controllers/clientPortalModuleSettingsController";

/**
 * Blocks a portal request when the staff have disabled that module for the
 * authenticated client. Must run AFTER `authenticateClientPortal` so
 * `req.portalUser` (tenantId + clientId) is available.
 *
 * Fail-open: if the client identity is missing or the lookup errors, the
 * request is allowed through — visibility is a convenience gate, not a
 * security boundary, and a transient DB hiccup should not lock a client out.
 */
export const requirePortalModule =
  (moduleKey: string) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = req.portalUser;
    if (!ctx?.clientId || !ctx?.tenantId) {
      next();
      return;
    }
    try {
      const enabled = await isModuleEnabled(
        ctx.tenantId,
        ctx.clientId,
        moduleKey,
      );
      if (!enabled) {
        res.status(403).json({
          success: false,
          error: "This page is not available for your account.",
          code: "PORTAL_MODULE_DISABLED",
        });
        return;
      }
      next();
    } catch {
      next();
    }
  };

export default requirePortalModule;
