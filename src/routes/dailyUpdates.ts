import { Router } from 'express';
import { DailyUpdateController } from '@/controllers/dailyUpdateController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   POST /api/daily-updates
 * @desc    Create new daily status update
 * @access  Private (all authenticated users)
 * @body    { mood?, totalHoursWorked?, projectUpdates: [], generalNotes? }
 */
router.post('/', DailyUpdateController.createUpdate);

/**
 * @route   GET /api/daily-updates/my
 * @desc    Get current user's daily updates
 * @access  Private (authenticated user)
 * @query   date?, limit?
 */
router.get('/my', DailyUpdateController.getMyUpdates);

/**
 * @route   GET /api/daily-updates/team
 * @desc    Get team's daily updates (PM/Admin only)
 * @access  Private (Project Manager or Super Admin)
 * @query   date?, projectId?, userId?
 */
router.get('/team', DailyUpdateController.getTeamUpdates);

/**
 * @route   GET /api/daily-updates/today
 * @desc    Get today's updates (role-based)
 * @access  Private (authenticated user)
 */
router.get('/today', DailyUpdateController.getTodayUpdates);

/**
 * @route   GET /api/daily-updates/check-today
 * @desc    Check if user has submitted update today
 * @access  Private (authenticated user)
 */
router.get('/check-today', DailyUpdateController.checkTodaySubmission);

/**
 * @route   GET /api/daily-updates/stats/submission-rate
 * @desc    Get submission statistics (PM/Admin only)
 * @access  Private (Project Manager or Super Admin)
 * @query   startDate?, endDate?, projectId?
 */
router.get('/stats/submission-rate', DailyUpdateController.getSubmissionStats);

/**
 * @route   GET /api/daily-updates/:id
 * @desc    Get specific daily update by ID
 * @access  Private (owner, PM, or admin)
 */
router.get('/:id', DailyUpdateController.getUpdateById);

/**
 * @route   PUT /api/daily-updates/:id
 * @desc    Update daily status update (same day only)
 * @access  Private (owner only)
 * @body    { mood?, totalHoursWorked?, projectUpdates: [], generalNotes? }
 */
router.put('/:id', DailyUpdateController.updateUpdate);

/**
 * @route   DELETE /api/daily-updates/:id
 * @desc    Delete daily status update
 * @access  Private (owner only)
 */
router.delete('/:id', DailyUpdateController.deleteUpdate);

export default router;
