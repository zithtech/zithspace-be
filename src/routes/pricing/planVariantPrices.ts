import { Router } from "express";
import { PlanVariantPricesController } from "@/controllers/pricing/planVariantPricesController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", PlanVariantPricesController.list);
router.get("/:id", PlanVariantPricesController.get);
router.post("/", PlanVariantPricesController.create);
router.put("/:id", PlanVariantPricesController.update);
router.patch("/:id/archive", PlanVariantPricesController.archive);
router.patch("/:id/restore", PlanVariantPricesController.restore);
router.delete("/:id", PlanVariantPricesController.remove);

export default router;
