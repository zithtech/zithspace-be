import express from "express";
import { EmployeeTimelineController } from "@/controllers/employeeTimelineController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

// ================= GLOBAL MIDDLEWARE =================
// Tenant context + Auth apply to all employee timeline routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ================= EMPLOYEE TIMELINE ROUTES =================

// Create employee timeline
router.post("/", requirePermission(Permissions.ONBOARDING_MANAGE), EmployeeTimelineController.createTimeline);

// Get timeline by employeeId
router.get(
  "/employee/:employeeId",
  requirePermission(Permissions.ONBOARDING_READ),
  EmployeeTimelineController.getTimelineByEmployee,
);

// Get timeline by timeline ID
router.get("/:id", requirePermission(Permissions.ONBOARDING_READ), EmployeeTimelineController.getTimelineById);

// Update employee timeline
router.put("/:id", requirePermission(Permissions.ONBOARDING_MANAGE), EmployeeTimelineController.updateTimeline);

// Delete employee timeline
router.delete("/:id", requirePermission(Permissions.ONBOARDING_MANAGE), EmployeeTimelineController.deleteTimeline);

export default router;
