import { Router } from "express";
import { SprintReportController } from "@/controllers/sprintReportController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { requireAiAccess } from "@/middleware/aiAccess";
import { Permissions } from "@/types/permissions";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/sprint-report/:sprintId
 * @desc    Phase 1 sprint report — overview, ticket distribution, contribution
 * @access  Private (tenant + ticket.read)
 */
router.get(
  "/:sprintId",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.getSprintReport
);

/**
 * @route   GET /api/sprint-report/:sprintId/timeline
 * @desc    Phase 2: per-ticket delay, transitions, reopens + aggregates
 */
router.get(
  "/:sprintId/timeline",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.getSprintTimeline
);

/**
 * @route   GET /api/sprint-report/:sprintId/scope
 * @desc    Phase 2: planned vs added-mid-sprint vs removed, with per-user breakdown
 */
router.get(
  "/:sprintId/scope",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.getSprintScopeChange
);

/**
 * @route   GET /api/sprint-report/:sprintId/velocity
 * @desc    Phase 2: daily completion bars + cumulative burndown + pace insights
 */
router.get(
  "/:sprintId/velocity",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.getSprintVelocity
);

/**
 * @route   GET /api/sprint-report/:sprintId/quality
 * @desc    Phase 3: per-ticket complexity + rework + reopens
 */
router.get(
  "/:sprintId/quality",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.getSprintQuality
);

/**
 * @route   GET /api/sprint-report/:sprintId/hotspots
 * @desc    Phase 3: hot epics + hot tags
 */
router.get(
  "/:sprintId/hotspots",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.getSprintHotspots
);

/**
 * @route   GET /api/sprint-report/:sprintId/bottlenecks
 * @desc    Phase 3: QA queue, blocked, oversized, single-person dependencies
 */
router.get(
  "/:sprintId/bottlenecks",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.getSprintBottlenecks
);

/**
 * @route   GET /api/sprint-report/:sprintId/ai-narrative
 * @desc    Phase 4: returns the cached AI narrative for this sprint (or null)
 */
router.get(
  "/:sprintId/ai-narrative",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.getAiNarrative
);

/**
 * @route   POST /api/sprint-report/:sprintId/ai-narrative
 * @desc    Phase 4: generates a fresh AI narrative, caches it, returns it
 */
router.post(
  "/:sprintId/ai-narrative",
  requirePermission(Permissions.TICKET_READ),
  requireAiAccess,
  SprintReportController.postAiNarrative
);

/**
 * @route   POST /api/sprint-report/:sprintId/export-pdf
 * @desc    Export Sprint Report to PDF via Puppeteer
 */
router.post(
  "/:sprintId/export-pdf",
  requirePermission(Permissions.TICKET_READ),
  SprintReportController.exportSprintReportPdf
);

export default router;
