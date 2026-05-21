import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import ClientMilestoneController from "@/controllers/clientMilestoneController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Milestone-level
router.put("/:id", ClientMilestoneController.update);
router.delete("/:id", ClientMilestoneController.remove);
router.post("/:id/items", ClientMilestoneController.addItem);

export default router;
