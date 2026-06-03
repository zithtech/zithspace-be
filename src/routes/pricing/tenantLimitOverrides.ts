import { Router } from "express";
import { TenantLimitOverridesController } from "@/controllers/pricing/tenantLimitOverridesController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", TenantLimitOverridesController.list);
router.put("/upsert", TenantLimitOverridesController.upsertByPair);
router.delete("/by-pair", TenantLimitOverridesController.removeByPair);
router.delete("/:id", TenantLimitOverridesController.removeById);

export default router;
