import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import ApprovalsStaffController from "@/controllers/approvalsStaffController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/:id", ApprovalsStaffController.detail);
router.patch("/:id/cancel", ApprovalsStaffController.cancel);
router.post("/:id/approvers", ApprovalsStaffController.addApprover);
router.delete(
  "/:id/approvers/:approverId",
  ApprovalsStaffController.removeApprover,
);

export default router;
