import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import ClientProjectReleaseController from "@/controllers/clientProjectReleaseController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.put("/:id", ClientProjectReleaseController.update);
router.delete("/:id", ClientProjectReleaseController.remove);

export default router;
