// src/routes/leaveRequestRoutes.ts

import express from "express";
import {
  applyLeave,
  getLeaveRequests,
  updateLeaveStatus,
  cancelLeaveRequest,
  getPendingApprovals
} from "@/controllers/leaverequestcontroller";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant, requireTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

// Apply middleware to all routes in this file
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);
router.use(requireTenant);

router.post("/", applyLeave);
router.get("/", getLeaveRequests);
router.put("/:id/status", requirePermission(Permissions.LEAVE_APPROVE), updateLeaveStatus);
router.put("/:id/cancel", cancelLeaveRequest);
router.get("/approvals", requirePermission(Permissions.LEAVE_APPROVE), getPendingApprovals);

export default router;