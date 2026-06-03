import { Router } from "express";
import { PlanVariantsController } from "@/controllers/pricing/planVariantsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", PlanVariantsController.list);
router.get("/:id", PlanVariantsController.get);
router.post("/", PlanVariantsController.create);
router.put("/:id", PlanVariantsController.update);
router.patch("/:id/archive", PlanVariantsController.archive);
router.patch("/:id/restore", PlanVariantsController.restore);
router.delete("/:id", PlanVariantsController.remove);

export default router;
