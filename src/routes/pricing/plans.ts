import { Router } from "express";
import { PlansController } from "@/controllers/pricing/plansController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", PlansController.list);
router.get("/:id", PlansController.get);
router.post("/", PlansController.create);
router.put("/:id", PlansController.update);
router.patch("/:id/archive", PlansController.archive);
router.patch("/:id/restore", PlansController.restore);
router.delete("/:id", PlansController.remove);

export default router;
