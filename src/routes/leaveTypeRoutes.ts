import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import { LeaveTypeController } from "@/controllers/leaveTypeController";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

// Routes
router.post("/", requirePermission(Permissions.LEAVE_MANAGE), LeaveTypeController.createLeaveType);
router.get("/", requirePermission(Permissions.LEAVE_READ), LeaveTypeController.getAllLeaveTypes);
router.get("/:id", requirePermission(Permissions.LEAVE_READ), LeaveTypeController.getLeaveTypeById);
router.put("/:id", requirePermission(Permissions.LEAVE_MANAGE), LeaveTypeController.updateLeaveType);
router.delete("/:id", requirePermission(Permissions.LEAVE_MANAGE), LeaveTypeController.deleteLeaveType);

export default router;
