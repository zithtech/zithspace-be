import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import TeamStaffController from "@/controllers/teamStaffController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.put("/:id", TeamStaffController.update);
router.delete("/:id", TeamStaffController.remove);

export default router;
