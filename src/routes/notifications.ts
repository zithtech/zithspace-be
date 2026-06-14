import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { NotificationController } from "@/controllers/NotificationController";

const router = Router();

// Apply tenant resolution to all routes
router.use(resolveTenant);

/**
 * @route GET /api/notifications/vapid-public-key
 * @desc Get the VAPID public key
 */
router.get("/vapid-public-key", NotificationController.getPublicKey);

/**
 * @route POST /api/notifications/subscribe
 * @desc Subscribe to push notifications
 */
router.post(
  "/subscribe",
  authenticateToken,
  requireAuth,
  NotificationController.subscribe
);

export default router;
