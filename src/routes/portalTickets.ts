import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import PortalTicketStaffController from "@/controllers/portalTicketStaffController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", PortalTicketStaffController.list);
router.get("/:id", PortalTicketStaffController.detail);
router.post("/:id/messages", PortalTicketStaffController.reply);
router.patch("/:id/status", PortalTicketStaffController.updateStatus);
router.patch("/:id/assign", PortalTicketStaffController.assign);

export default router;
