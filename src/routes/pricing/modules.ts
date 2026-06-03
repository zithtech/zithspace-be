import { Router } from "express";
import { ModulesController } from "@/controllers/pricing/modulesController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", ModulesController.list);
router.get("/:id", ModulesController.get);
router.post("/", ModulesController.create);
router.put("/:id", ModulesController.update);
router.patch("/:id/archive", ModulesController.archive);
router.patch("/:id/restore", ModulesController.restore);
router.delete("/:id", ModulesController.remove);

export default router;
