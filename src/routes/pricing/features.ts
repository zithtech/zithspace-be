import { Router } from "express";
import { FeaturesController } from "@/controllers/pricing/featuresController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", FeaturesController.list);
router.get("/:id", FeaturesController.get);
router.post("/", FeaturesController.create);
router.put("/:id", FeaturesController.update);
router.patch("/:id/archive", FeaturesController.archive);
router.patch("/:id/restore", FeaturesController.restore);
router.delete("/:id", FeaturesController.remove);

export default router;
