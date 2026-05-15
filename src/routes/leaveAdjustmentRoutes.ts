import { Router } from "express";
import {
  createLeaveAdjustment,
  getLeaveAdjustments,
  updateLeaveAdjustment,
  deleteLeaveAdjustment,
} from "../controllers/leaveAdjustmentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

// Apply tenant context and authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.post("/", requirePermission(Permissions.LEAVE_ADJUSTMENT_CREATE), createLeaveAdjustment);
router.get("/", requirePermission(Permissions.LEAVE_ADJUSTMENT_READ), getLeaveAdjustments);
router.put("/:id", requirePermission(Permissions.LEAVE_ADJUSTMENT_UPDATE), updateLeaveAdjustment);
router.delete("/:id", requirePermission(Permissions.LEAVE_ADJUSTMENT_DELETE), deleteLeaveAdjustment);

export default router;