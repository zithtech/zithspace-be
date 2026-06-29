"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendanceController_1 = require("@/controllers/attendanceController");
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/attendance/dashboard/summary
 * @desc    Get attendance dashboard summary (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get("/dashboard/summary", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_DASHBOARD_READ), attendanceController_1.AttendanceController.getDashboardSummary);
/**
 * @route   GET /api/attendance/dashboard/present
 * @desc    Get present members (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get("/dashboard/present", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_DASHBOARD_READ), attendanceController_1.AttendanceController.getPresentMembers);
/**
 * @route   GET /api/attendance/today
 * @desc    Get today's attendance for current user (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get("/today", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ATTENDANCE_READ, permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.getTodayAttendance);
/**
 * @route   GET /api/attendance/my-summary
 * @desc    Get my attendance summary (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   month, year
 */
router.get("/my-summary", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ATTENDANCE_READ, permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.getMyAttendanceSummary);
/**
 * @route   GET /api/attendance
 * @desc    Get all attendance records with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, userId, date, status, startDate, endDate, sortBy, sortOrder
 */
router.get("/", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ATTENDANCE_READ, permissions_1.Permissions.ATTENDANCE_CREATE, permissions_1.Permissions.ATTENDANCE_UPDATE, permissions_1.Permissions.ATTENDANCE_DELETE, permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.getAttendance);
// last 5 days  average working hors routes
router.get("/last-5-average", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ATTENDANCE_READ, permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.getLast5DaysAverage);
/**
 * @route   GET /api/attendance/:id
 * @desc    Get attendance record by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Attendance record ID
 */
router.get("/:id", (0, permission_1.requireAnyPermission)(permissions_1.Permissions.ATTENDANCE_READ, permissions_1.Permissions.ATTENDANCE_CREATE, permissions_1.Permissions.ATTENDANCE_UPDATE, permissions_1.Permissions.ATTENDANCE_DELETE), attendanceController_1.AttendanceController.getAttendanceById);
/**
 * @route   POST /api/attendance/clock-in
 * @desc    Clock in (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string } - optional for admin to clock in others
 */
router.post("/clock-in", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.clockIn);
/**
 * @route   POST /api/attendance/clock-out
 * @desc    Clock out (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string } - optional for admin to clock out others
 */
router.post("/clock-out", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.clockOut);
/**
 * @route   POST /api/attendance/pause
 * @desc    Pause the day — close the current open work session (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string }
 */
router.post("/pause", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.pause);
/**
 * @route   POST /api/attendance/resume
 * @desc    Resume the day — open a new work session after a break (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string }
 */
router.post("/resume", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.resume);
/**
 * @route   POST /api/attendance/complete
 * @desc    Complete the day — close any open session and finalize totals (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string }
 */
router.post("/complete", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_CLOCK_IN_OUT), attendanceController_1.AttendanceController.complete);
/**
 * @route   POST /api/attendance
 * @desc    Create manual attendance entry (tenant-aware)
 * @access  Private (admin only)
 * @body    CreateAttendanceData
 */
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_CREATE), attendanceController_1.AttendanceController.createAttendance);
/**
 * @route   POST /api/attendance/:id/reopen
 * @desc    Reopen an accidentally-completed day (tenant-aware, manager action)
 * @access  Private (requires ATTENDANCE_UPDATE)
 * @param   id - Attendance record ID
 * @body    { resumeAt: string } - ISO time to resume work from
 */
router.post("/:id/reopen", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_UPDATE), attendanceController_1.AttendanceController.reopenDay);
/**
 * @route   PUT /api/attendance/:id
 * @desc    Update attendance record (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Attendance record ID
 * @body    Partial attendance data
 */
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_UPDATE), attendanceController_1.AttendanceController.updateAttendance);
/**
 * @route   DELETE /api/attendance/:id
 * @desc    Delete attendance record (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Attendance record ID
 */
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ATTENDANCE_DELETE), attendanceController_1.AttendanceController.deleteAttendance);
exports.default = router;
//# sourceMappingURL=attendance.js.map