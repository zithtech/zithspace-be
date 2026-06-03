import { Router } from "express";
import { TenantFeatureOverridesController } from "@/controllers/pricing/tenantFeatureOverridesController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", TenantFeatureOverridesController.list);
router.put("/upsert", TenantFeatureOverridesController.upsertByPair);
router.delete("/by-pair", TenantFeatureOverridesController.removeByPair);
router.delete("/:id", TenantFeatureOverridesController.removeById);

export default router;
