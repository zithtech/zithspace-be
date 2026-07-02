"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dailyUpdateController_1 = require("@/controllers/dailyUpdateController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   POST /api/daily-updates
 * @desc    Create new daily status update
 * @access  Private (all authenticated users)
 * @body    { mood?, totalHoursWorked?, projectUpdates: [], generalNotes? }
 */
router.post('/', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_CREATE), dailyUpdateController_1.DailyUpdateController.createUpdate);
/**
 * @route   GET /api/daily-updates/my
 * @desc    Get current user's daily updates
 * @access  Private (authenticated user)
 * @query   date?, limit?
 */
router.get('/my', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_READ), dailyUpdateController_1.DailyUpdateController.getMyUpdates);
/**
 * @route   GET /api/daily-updates/team
 * @desc    Get team's daily updates (PM/Admin only)
 * @access  Private (Project Manager or Super Admin)
 * @query   date?, projectId?, userId?
 */
router.get('/team', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_READ), dailyUpdateController_1.DailyUpdateController.getTeamUpdates);
/**
 * @route   GET /api/daily-updates/today
 * @desc    Get today's updates (role-based)
 * @access  Private (authenticated user)
 */
router.get('/today', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_READ), dailyUpdateController_1.DailyUpdateController.getTodayUpdates);
/**
 * @route   GET /api/daily-updates/check-today
 * @desc    Check if user has submitted update today
 * @access  Private (authenticated user)
 */
router.get('/check-today', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_READ), dailyUpdateController_1.DailyUpdateController.checkTodaySubmission);
/**
 * @route   GET /api/daily-updates/stats/submission-rate
 * @desc    Get submission statistics (PM/Admin only)
 * @access  Private (Project Manager or Super Admin)
 * @query   startDate?, endDate?, projectId?
 */
router.get('/stats/submission-rate', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_MANAGE_TIME), dailyUpdateController_1.DailyUpdateController.getSubmissionStats);
/**
 * @route   GET /api/daily-updates/:id
 * @desc    Get specific daily update by ID
 * @access  Private (owner, PM, or admin)
 */
router.get('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_READ), dailyUpdateController_1.DailyUpdateController.getUpdateById);
/**
 * @route   PUT /api/daily-updates/:id
 * @desc    Update daily status update (same day only)
 * @access  Private (owner only)
 * @body    { mood?, totalHoursWorked?, projectUpdates: [], generalNotes? }
 */
router.put('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_UPDATE), dailyUpdateController_1.DailyUpdateController.updateUpdate);
/**
 * @route   DELETE /api/daily-updates/:id
 * @desc    Delete daily status update
 * @access  Private (owner only)
 */
router.delete('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.DAILY_UPDATE_DELETE), dailyUpdateController_1.DailyUpdateController.deleteUpdate);
exports.default = router;
//# sourceMappingURL=dailyUpdates.js.map