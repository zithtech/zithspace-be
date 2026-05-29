import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import CrStaffController from "@/controllers/crStaffController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/:id", CrStaffController.detail);
router.put("/:id", requirePermission(Permissions.CLIENT_UPDATE), CrStaffController.update);
router.delete("/:id", requirePermission(Permissions.CLIENT_DELETE), CrStaffController.delete);
router.patch("/:id/estimate", CrStaffController.updateEstimate);
router.patch("/:id/status", CrStaffController.updateStatus);
router.patch("/:id/link", CrStaffController.updateLinks);
router.patch("/:id/assign", CrStaffController.assign);
router.post("/:id/messages", CrStaffController.reply);

export default router;
