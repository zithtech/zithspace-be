import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import EnvironmentsStaffController from "@/controllers/environmentsStaffController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.delete("/:deploymentId", EnvironmentsStaffController.removeDeployment);

export default router;
