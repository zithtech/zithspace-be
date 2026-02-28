"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const timesheetController_1 = require("@/controllers/timesheetController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// Middleware: tenant resolution & authentication
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/* ================== TIMESHEET ROUTES ================== */
/**
 * @route   GET /api/timesheets/meta
 * @desc    Get user projects & tasks for timesheet
 * @access  Private
 */
router.get("/meta", (0, permission_1.requirePermission)(permissions_1.Permissions.TIMESHEET_READ), timesheetController_1.TimesheetController.getTimesheetMeta);
/**
 * @route   GET /api/timesheets
 * @desc    Get all timesheets for current tenant (with optional pagination)
 * @access  Private
 */
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.TIMESHEET_READ), timesheetController_1.TimesheetController.getTimesheets);
/**
 * @route   GET /api/timesheets/:id
 * @desc    Get a single timesheet by ID
 * @access  Private
 */
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.TIMESHEET_READ), timesheetController_1.TimesheetController.getTimesheetById);
/**
 * @route   POST /api/timesheets
 * @desc    Create a new timesheet (DRAFT)
 * @access  Private
 */
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.TIMESHEET_CREATE), timesheetController_1.TimesheetController.createTimesheet);
/**
 * @route   PUT /api/timesheets/:id
 * @desc    Update timesheet rows or basic info
 * @access  Private
 */
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.TIMESHEET_UPDATE), timesheetController_1.TimesheetController.updateTimesheet);
/**
 * @route   POST /api/timesheets/:id/submit
 * @desc    Submit a timesheet
 * @access  Private
 */
// router.post("/:id/submit", TimesheetController.approveTimesheet);
//  // if submit uses approve logic, else create separate submit method
router.post("/:id/submit", (0, permission_1.requirePermission)(permissions_1.Permissions.TIMESHEET_UPDATE), timesheetController_1.TimesheetController.submitTimesheet);
/**
 * @route   POST /api/timesheets/:id/review
 * @desc    Approve or reject a timesheet
 * @access  Private (admin or manager)
 */
router.post("/:id/review", (0, permission_1.requirePermission)(permissions_1.Permissions.TIMESHEET_APPROVE), timesheetController_1.TimesheetController.approveTimesheet);
/**
 * @route   DELETE /api/timesheets/:id
 * @desc    Delete a timesheet
 * @access  Private
 */
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.TIMESHEET_MANAGE), timesheetController_1.TimesheetController.deleteTimesheet);
exports.default = router;
//# sourceMappingURL=timesheet.js.map