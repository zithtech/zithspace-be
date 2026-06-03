import { Router } from "express";
import { TenantAddonsController } from "@/controllers/pricing/tenantAddonsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", TenantAddonsController.list);
router.post("/", TenantAddonsController.create);
router.get("/:id", TenantAddonsController.get);
router.put("/:id/quantity", TenantAddonsController.updateQuantity);
router.patch("/:id/cancel", TenantAddonsController.cancel);
router.patch("/:id/status", TenantAddonsController.setStatus);
router.delete("/:id", TenantAddonsController.remove);

export default router;
