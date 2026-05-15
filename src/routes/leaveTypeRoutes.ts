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
router.post("/", requirePermission(Permissions.LEAVE_TYPE_CREATE), LeaveTypeController.createLeaveType);
router.get("/", requirePermission(Permissions.LEAVE_TYPE_READ), LeaveTypeController.getAllLeaveTypes);
router.get("/:id", requirePermission(Permissions.LEAVE_TYPE_READ), LeaveTypeController.getLeaveTypeById);
router.put("/:id", requirePermission(Permissions.LEAVE_TYPE_UPDATE), LeaveTypeController.updateLeaveType);
router.delete("/:id", requirePermission(Permissions.LEAVE_TYPE_DELETE), LeaveTypeController.deleteLeaveType);

export default router;
