import express from "express";
import { EmployeeTimelineController } from "@/controllers/employeeTimelineController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

// ================= GLOBAL MIDDLEWARE =================
// Tenant context + Auth apply to all employee timeline routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ================= EMPLOYEE TIMELINE ROUTES =================

// Create employee timeline
router.post("/", EmployeeTimelineController.createTimeline);

// Get timeline by employeeId
router.get(
  "/employee/:employeeId",
  EmployeeTimelineController.getTimelineByEmployee,
);

// Get timeline by timeline ID
router.get("/:id", EmployeeTimelineController.getTimelineById);

// Update employee timeline
router.put("/:id", EmployeeTimelineController.updateTimeline);

// Delete employee timeline
router.delete("/:id", EmployeeTimelineController.deleteTimeline);

export default router;
