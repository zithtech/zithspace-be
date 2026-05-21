import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import ClientMilestoneController from "@/controllers/clientMilestoneController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.put("/:id", ClientMilestoneController.updateItem);
router.delete("/:id", ClientMilestoneController.removeItem);

export default router;
