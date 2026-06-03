import { Router } from "express";
import { EntitlementsController } from "@/controllers/pricing/entitlementsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// /me uses resolveTenant so req.tenantId is populated from subdomain / header.
router.get(
  "/me",
  resolveTenant,
  authenticateToken,
  requireAuth,
  EntitlementsController.getMine
);

// Admin views — no tenant resolution needed (id comes from path).
// TODO(pricing): swap to requirePlatformAdmin when that middleware exists.
router.get(
  "/tenant/:tenantId",
  authenticateToken,
  requireAuth,
  EntitlementsController.getForTenant
);
router.post(
  "/invalidate-cache",
  authenticateToken,
  requireAuth,
  EntitlementsController.invalidateCache
);

export default router;
