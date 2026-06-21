import { Router } from "express";
import { SprintReportsController } from "@/controllers/sprintReportsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/sprint-reports?projectId=...
 * @desc    List completed sprints for a project with their generated report summary
 * @access  Private (tenant + ticket.read)
 */
router.get(
  "/",
  requirePermission(Permissions.TICKET_READ),
  SprintReportsController.listProjectReports
);

/**
 * @route   GET /api/sprint-reports/sprint/:sprintId
 * @desc    Stored report snapshot (summary + full report_data) for a sprint
 * @access  Private (tenant + ticket.read)
 */
router.get(
  "/sprint/:sprintId",
  requirePermission(Permissions.TICKET_READ),
  SprintReportsController.getReportBySprint
);

/**
 * @route   POST /api/sprint-reports/sprint/:sprintId/generate
 * @desc    Generate (or regenerate) the report snapshot for a sprint
 * @access  Private (tenant + ticket.read)
 */
router.post(
  "/sprint/:sprintId/generate",
  requirePermission(Permissions.TICKET_READ),
  SprintReportsController.generateReport
);

export default router;
