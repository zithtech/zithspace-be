import { Router } from "express";
import { AddonsController } from "@/controllers/pricing/addonsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", AddonsController.list);
router.get("/:id", AddonsController.get);
router.post("/", AddonsController.create);
router.put("/:id", AddonsController.update);
router.patch("/:id/archive", AddonsController.archive);
router.patch("/:id/restore", AddonsController.restore);
router.delete("/:id", AddonsController.remove);

export default router;
