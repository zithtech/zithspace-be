import { Router } from "express";
import { PlanLimitsController } from "@/controllers/pricing/planLimitsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", PlanLimitsController.list);
router.post("/", PlanLimitsController.create);
router.put("/upsert", PlanLimitsController.upsertByPair);
router.put("/:id", PlanLimitsController.update);
router.delete("/by-pair", PlanLimitsController.removeByPair);
router.delete("/:id", PlanLimitsController.remove);

export default router;
