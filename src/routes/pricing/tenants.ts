import { Router } from "express";
import { PricingTenantsController } from "@/controllers/pricing/pricingTenantsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", PricingTenantsController.list);
router.get("/:id", PricingTenantsController.get);

export default router;
