import { Router } from "express";
import { SubscriptionsController } from "@/controllers/pricing/subscriptionsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", SubscriptionsController.list);
router.post("/", SubscriptionsController.create);
router.post("/change-plan", SubscriptionsController.changePlan);
router.get("/:id", SubscriptionsController.get);
router.patch("/:id/cancel", SubscriptionsController.cancel);
router.patch("/:id/status", SubscriptionsController.setStatus);

export default router;
