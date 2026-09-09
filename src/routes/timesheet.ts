import { Router } from "express";
import { TimesheetController } from "@/controllers/timesheetController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import { requireSubscriptionFeature } from "@/modules/entitlements/entitlements.middleware";

const router = Router();

// Middleware: tenant resolution & authentication
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/* ================== TIMESHEET ROUTES ================== */


/**
 * @route   GET /api/timesheets/meta
 * @desc    Get user projects & tasks for timesheet
 * @access  Private
 */
router.get("/meta", requirePermission(Permissions.TIMESHEET_READ), requireSubscriptionFeature('work_timesheet_my_timesheets', { exact: false }), TimesheetController.getTimesheetMeta);


/**
 * @route   GET /api/timesheets
 * @desc    Get all timesheets for current tenant (with optional pagination)
 * @access  Private
 */
router.get("/", requirePermission(Permissions.TIMESHEET_READ), requireSubscriptionFeature('work_timesheet_my_timesheets', { exact: false }), TimesheetController.getTimesheets);

/**
 * @route   GET /api/timesheets/:id
 * @desc    Get a single timesheet by ID
 * @access  Private
 */
router.get("/:id", requirePermission(Permissions.TIMESHEET_READ), requireSubscriptionFeature('work_timesheet_my_timesheets', { exact: false }), TimesheetController.getTimesheetById);

/**
 * @route   POST /api/timesheets
 * @desc    Create a new timesheet (DRAFT)
 * @access  Private
 */
router.post("/", requirePermission(Permissions.TIMESHEET_CREATE), requireSubscriptionFeature('work_timesheet_submit', { exact: false }), TimesheetController.createTimesheet);

/**
 * @route   PUT /api/timesheets/:id
 * @desc    Update timesheet rows or basic info
 * @access  Private
 */
router.put("/:id", requirePermission(Permissions.TIMESHEET_UPDATE), requireSubscriptionFeature('work_timesheet_submit', { exact: false }), TimesheetController.updateTimesheet);

/**
 * @route   POST /api/timesheets/:id/submit
 * @desc    Submit a timesheet
 * @access  Private
 */
router.post("/:id/submit", requirePermission(Permissions.TIMESHEET_UPDATE), requireSubscriptionFeature('work_timesheet_submit', { exact: false }), TimesheetController.submitTimesheet);


/**
 * @route   POST /api/timesheets/:id/review
 * @desc    Approve or reject a timesheet
 * @access  Private (admin or manager)
 */
router.post("/:id/review", requirePermission(Permissions.TIMESHEET_APPROVE), requireSubscriptionFeature('work_timesheet_approval', { exact: false }), TimesheetController.approveTimesheet);

/**
 * @route   DELETE /api/timesheets/:id
 * @desc    Delete a timesheet
 * @access  Private
 */
router.delete("/:id", requirePermission(Permissions.TIMESHEET_MANAGE), requireSubscriptionFeature('work_timesheet_my_timesheets', { exact: false }), TimesheetController.deleteTimesheet);



export default router;
