import express from "express";
import {
  createLeaveOriginStructure,
  createOriginLeaveType,
  updateLeaveOriginStructure,
  getAllLeaveOrigins,
  deleteLeaveOriginStructure,
  deleteOriginLeaveType,
  updateOriginLeaveType
} from "@/controllers/leaveOriginController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant, requireTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

// Apply middleware to ensure user is authenticated and tenant is identified
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);
router.use(requireTenant);

router.get("/", requirePermission(Permissions.LEAVE_READ), getAllLeaveOrigins);
router.post("/structure", requirePermission(Permissions.LEAVE_MANAGE), createLeaveOriginStructure);
router.put("/structure/:id", requirePermission(Permissions.LEAVE_MANAGE), updateLeaveOriginStructure);
router.post("/type", requirePermission(Permissions.LEAVE_MANAGE), createOriginLeaveType);
router.put("/type/:id", requirePermission(Permissions.LEAVE_MANAGE), updateOriginLeaveType);
router.delete("/structure/:id", requirePermission(Permissions.LEAVE_MANAGE), deleteLeaveOriginStructure);
router.delete("/type/:id", requirePermission(Permissions.LEAVE_MANAGE), deleteOriginLeaveType);

export default router;