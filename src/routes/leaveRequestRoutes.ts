// src/routes/leaveRequestRoutes.ts

import express from "express";
import {
  applyLeave,
  getLeaveRequests,
  updateLeaveStatus,
  cancelLeaveRequest
} from "@/controllers/leaverequestcontroller";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant, requireTenant } from "@/middleware/tenantContext";

const router = express.Router();

// Apply middleware to all routes in this file
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);
router.use(requireTenant);

router.post("/", applyLeave);
router.get("/", getLeaveRequests);
router.put("/:id/status", updateLeaveStatus);
router.put("/:id/cancel", cancelLeaveRequest);

export default router;