import { Router } from "express";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { LeaveTypeController } from "@/controllers/leaveTypeController";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

// Routes
router.post("/", LeaveTypeController.createLeaveType);
router.get("/", LeaveTypeController.getAllLeaveTypes);
router.get("/:id", LeaveTypeController.getLeaveTypeById);
router.put("/:id", LeaveTypeController.updateLeaveType);
router.delete("/:id", LeaveTypeController.deleteLeaveType);

export default router;
