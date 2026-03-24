import { Router } from "express";
import { AttendanceController } from "@/controllers/attendanceController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
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
  requirePermission(Permissions.ATTENDANCE_READ),
  AttendanceController.getDashboardSummary,
);

/**
 * @route   GET /api/attendance/dashboard/present
 * @desc    Get present members (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get(
  "/dashboard/present",
  requirePermission(Permissions.ATTENDANCE_READ),
  AttendanceController.getPresentMembers,
);

/**
 * @route   GET /api/attendance/today
 * @desc    Get today's attendance for current user (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get(
  "/today",
  requirePermission(Permissions.ATTENDANCE_READ),
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
  requirePermission(Permissions.ATTENDANCE_READ),
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
  requirePermission(Permissions.ATTENDANCE_READ),
  AttendanceController.getAttendance,
);

// last 5 days  average working hors routes

router.get("/last-5-average", AttendanceController.getLast5DaysAverage);

/**
 * @route   GET /api/attendance/:id
 * @desc    Get attendance record by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Attendance record ID
 */
router.get(
  "/:id",
  requirePermission(Permissions.ATTENDANCE_READ),
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
  requirePermission(Permissions.ATTENDANCE_CREATE),
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
  requirePermission(Permissions.ATTENDANCE_CREATE),
  AttendanceController.clockOut,
);

/**
 * @route   POST /api/attendance
 * @desc    Create manual attendance entry (tenant-aware)
 * @access  Private (admin only)
 * @body    CreateAttendanceData
 */
router.post(
  "/",
  requirePermission(Permissions.ATTENDANCE_MANAGE),
  AttendanceController.createAttendance,
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
  requirePermission(Permissions.ATTENDANCE_MANAGE),
  AttendanceController.updateAttendance,
);

export default router;
