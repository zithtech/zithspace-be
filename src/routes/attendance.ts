import { Router } from "express";
import { AttendanceController } from "@/controllers/attendanceController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission, requireAnyPermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/attendance/dashboard/summary
 * @desc    Get attendance dashboard summary (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get(
  "/dashboard/summary",
  requirePermission(Permissions.ATTENDANCE_DASHBOARD_READ),
  AttendanceController.getDashboardSummary,
);

/**
 * @route   GET /api/attendance/dashboard/present
 * @desc    Get present members (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get(
  "/dashboard/present",
  requirePermission(Permissions.ATTENDANCE_DASHBOARD_READ),
  AttendanceController.getPresentMembers,
);

/**
 * @route   GET /api/attendance/today
 * @desc    Get today's attendance for current user (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get(
  "/today",
  requireAnyPermission(Permissions.ATTENDANCE_READ, Permissions.ATTENDANCE_CLOCK_IN_OUT),
  AttendanceController.getTodayAttendance,
);

/**
 * @route   GET /api/attendance/my-summary
 * @desc    Get my attendance summary (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   month, year
 */
router.get(
  "/my-summary",
  requireAnyPermission(Permissions.ATTENDANCE_READ, Permissions.ATTENDANCE_CLOCK_IN_OUT),
  AttendanceController.getMyAttendanceSummary,
);

/**
 * @route   GET /api/attendance
 * @desc    Get all attendance records with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, userId, date, status, startDate, endDate, sortBy, sortOrder
 */
router.get(
  "/",
  requireAnyPermission(
    Permissions.ATTENDANCE_READ,
    Permissions.ATTENDANCE_CREATE,
    Permissions.ATTENDANCE_UPDATE,
    Permissions.ATTENDANCE_DELETE,
    Permissions.ATTENDANCE_CLOCK_IN_OUT
  ),
  AttendanceController.getAttendance,
);

// last 5 days  average working hors routes

router.get(
  "/last-5-average",
  requireAnyPermission(Permissions.ATTENDANCE_READ, Permissions.ATTENDANCE_CLOCK_IN_OUT),
  AttendanceController.getLast5DaysAverage
);

/**
 * @route   GET /api/attendance/:id
 * @desc    Get attendance record by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Attendance record ID
 */
router.get(
  "/:id",
  requireAnyPermission(
    Permissions.ATTENDANCE_READ,
    Permissions.ATTENDANCE_CREATE,
    Permissions.ATTENDANCE_UPDATE,
    Permissions.ATTENDANCE_DELETE
  ),
  AttendanceController.getAttendanceById,
);

/**
 * @route   POST /api/attendance/clock-in
 * @desc    Clock in (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string } - optional for admin to clock in others
 */
router.post(
  "/clock-in",
  requirePermission(Permissions.ATTENDANCE_CLOCK_IN_OUT),
  AttendanceController.clockIn,
);

/**
 * @route   POST /api/attendance/clock-out
 * @desc    Clock out (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string } - optional for admin to clock out others
 */
router.post(
  "/clock-out",
  requirePermission(Permissions.ATTENDANCE_CLOCK_IN_OUT),
  AttendanceController.clockOut,
);

/**
 * @route   POST /api/attendance/pause
 * @desc    Pause the day — close the current open work session (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string }
 */
router.post(
  "/pause",
  requirePermission(Permissions.ATTENDANCE_CLOCK_IN_OUT),
  AttendanceController.pause,
);

/**
 * @route   POST /api/attendance/resume
 * @desc    Resume the day — open a new work session after a break (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string }
 */
router.post(
  "/resume",
  requirePermission(Permissions.ATTENDANCE_CLOCK_IN_OUT),
  AttendanceController.resume,
);

/**
 * @route   POST /api/attendance/complete
 * @desc    Complete the day — close any open session and finalize totals (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { userId?: string }
 */
router.post(
  "/complete",
  requirePermission(Permissions.ATTENDANCE_CLOCK_IN_OUT),
  AttendanceController.complete,
);

/**
 * @route   POST /api/attendance
 * @desc    Create manual attendance entry (tenant-aware)
 * @access  Private (admin only)
 * @body    CreateAttendanceData
 */
router.post(
  "/",
  requirePermission(Permissions.ATTENDANCE_CREATE),
  AttendanceController.createAttendance,
);

/**
 * @route   POST /api/attendance/:id/reopen
 * @desc    Reopen an accidentally-completed day (tenant-aware, manager action)
 * @access  Private (requires ATTENDANCE_UPDATE)
 * @param   id - Attendance record ID
 * @body    { resumeAt: string } - ISO time to resume work from
 */
router.post(
  "/:id/reopen",
  requirePermission(Permissions.ATTENDANCE_UPDATE),
  AttendanceController.reopenDay,
);

/**
 * @route   PUT /api/attendance/:id
 * @desc    Update attendance record (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Attendance record ID
 * @body    Partial attendance data
 */
router.put(
  "/:id",
  requirePermission(Permissions.ATTENDANCE_UPDATE),
  AttendanceController.updateAttendance,
);

/**
 * @route   DELETE /api/attendance/:id
 * @desc    Delete attendance record (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Attendance record ID
 */
router.delete(
  "/:id",
  requirePermission(Permissions.ATTENDANCE_DELETE),
  AttendanceController.deleteAttendance,
);

export default router;
