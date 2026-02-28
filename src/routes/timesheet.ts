import { Router } from "express";
import { TimesheetController } from "@/controllers/timesheetController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

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
router.get("/meta", requirePermission(Permissions.TIMESHEET_READ), TimesheetController.getTimesheetMeta);


/**
 * @route   GET /api/timesheets
 * @desc    Get all timesheets for current tenant (with optional pagination)
 * @access  Private
 */
router.get("/", requirePermission(Permissions.TIMESHEET_READ), TimesheetController.getTimesheets);

/**
 * @route   GET /api/timesheets/:id
 * @desc    Get a single timesheet by ID
 * @access  Private
 */
router.get("/:id", requirePermission(Permissions.TIMESHEET_READ), TimesheetController.getTimesheetById);

/**
 * @route   POST /api/timesheets
 * @desc    Create a new timesheet (DRAFT)
 * @access  Private
 */
router.post("/", requirePermission(Permissions.TIMESHEET_CREATE), TimesheetController.createTimesheet);

/**
 * @route   PUT /api/timesheets/:id
 * @desc    Update timesheet rows or basic info
 * @access  Private
 */
router.put("/:id", requirePermission(Permissions.TIMESHEET_UPDATE), TimesheetController.updateTimesheet);

/**
 * @route   POST /api/timesheets/:id/submit
 * @desc    Submit a timesheet
 * @access  Private
 */
// router.post("/:id/submit", TimesheetController.approveTimesheet);
//  // if submit uses approve logic, else create separate submit method
router.post("/:id/submit", requirePermission(Permissions.TIMESHEET_UPDATE), TimesheetController.submitTimesheet);


/**
 * @route   POST /api/timesheets/:id/review
 * @desc    Approve or reject a timesheet
 * @access  Private (admin or manager)
 */
router.post("/:id/review", requirePermission(Permissions.TIMESHEET_APPROVE), TimesheetController.approveTimesheet);

/**
 * @route   DELETE /api/timesheets/:id
 * @desc    Delete a timesheet
 * @access  Private
 */
router.delete("/:id", requirePermission(Permissions.TIMESHEET_MANAGE), TimesheetController.deleteTimesheet);



export default router;
