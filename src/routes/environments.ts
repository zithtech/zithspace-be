import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import EnvironmentsStaffController from "@/controllers/environmentsStaffController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/:id", EnvironmentsStaffController.detail);
router.put("/:id", EnvironmentsStaffController.update);
router.delete("/:id", EnvironmentsStaffController.remove);

router.post(
  "/:id/deployments",
  EnvironmentsStaffController.createDeployment,
);

export default router;
