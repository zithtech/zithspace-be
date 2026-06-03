import { Router } from "express";
import { PlanFeaturesController } from "@/controllers/pricing/planFeaturesController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", PlanFeaturesController.list);
router.post("/", PlanFeaturesController.create);
router.delete("/by-pair", PlanFeaturesController.removeByPair);
router.delete("/:id", PlanFeaturesController.remove);

export default router;
