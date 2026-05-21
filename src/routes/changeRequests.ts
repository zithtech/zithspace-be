import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import CrStaffController from "@/controllers/crStaffController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/:id", CrStaffController.detail);
router.patch("/:id/estimate", CrStaffController.updateEstimate);
router.patch("/:id/status", CrStaffController.updateStatus);
router.patch("/:id/link", CrStaffController.updateLinks);
router.patch("/:id/assign", CrStaffController.assign);
router.post("/:id/messages", CrStaffController.reply);

export default router;
