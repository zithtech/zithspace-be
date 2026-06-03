import { Router } from "express";
import { LimitsCatalogController } from "@/controllers/pricing/limitsCatalogController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", LimitsCatalogController.list);
router.get("/:id", LimitsCatalogController.get);
router.post("/", LimitsCatalogController.create);
router.put("/:id", LimitsCatalogController.update);
router.patch("/:id/archive", LimitsCatalogController.archive);
router.patch("/:id/restore", LimitsCatalogController.restore);
router.delete("/:id", LimitsCatalogController.remove);

export default router;
