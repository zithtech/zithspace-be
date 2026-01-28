import { Router } from 'express';
import { ReleasePlansController } from '@/controllers/releasePlansController';
import { authenticateToken, requireAuth, requireAdmin } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/release-plans/active
 * @desc    Get active release plans (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/active', ReleasePlansController.getActiveReleasePlans);

/**
 * @route   GET /api/release-plans/available
 * @desc    Get available sprints (active + planning) for sprint assignment (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId (required)
 */
router.get('/available', ReleasePlansController.getAvailableSprints);

/**
 * @route   GET /api/release-plans/stats
 * @desc    Get release plan statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/stats', ReleasePlansController.getReleasePlanStats);

/**
 * @route   GET /api/release-plans/projects/:projectId
 * @desc    Get release plans by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 */
router.get('/projects/:projectId', ReleasePlansController.getReleasePlansByProject);

/**
 * @route   GET /api/release-plans/tickets/:projectId
 * @desc    Get tickets by project for release plan assignment (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 * @query   search, limit
 */
router.get('/tickets/:projectId', ReleasePlansController.getProjectTickets);

/**
 * @route   GET /api/release-plans/:id/available-tickets/:projectId
 * @desc    Get tickets available for assignment to release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @param   projectId - Project ID
 * @query   search, limit, excludeReleasePlan
 */
router.get('/:id/available-tickets/:projectId', ReleasePlansController.getAvailableTickets);

/**
 * @route   GET /api/release-plans
 * @desc    Get all release plans with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, projectId, status, search, sortBy, sortOrder
 */
router.get('/', ReleasePlansController.getReleasePlans);

/**
 * @route   GET /api/release-plans/:id
 * @desc    Get release plan by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.get('/:id', ReleasePlansController.getReleasePlanById);

/**
 * @route   POST /api/release-plans
 * @desc    Create new release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { version, description, projectId, releaseDate?, status? }
 */
router.post('/', ReleasePlansController.createReleasePlan);

/**
 * @route   PUT /api/release-plans/:id
 * @desc    Update release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    Partial release plan data
 */
router.put('/:id', ReleasePlansController.updateReleasePlan);

/**
 * @route   DELETE /api/release-plans/:id
 * @desc    Delete release plan (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Release plan ID
 */
router.delete('/:id', requireAdmin, ReleasePlansController.deleteReleasePlan);

/**
 * @route   POST /api/release-plans/:id/start
 * @desc    Start a sprint (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.post('/:id/start', ReleasePlansController.startSprint);

/**
 * @route   POST /api/release-plans/:id/complete
 * @desc    Complete a sprint (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.post('/:id/complete', ReleasePlansController.completeSprint);

/**
 * @route   POST /api/release-plans/:id/tickets/assign
 * @desc    Assign tickets to release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/tickets/assign', ReleasePlansController.assignTicketsToReleasePlan);

/**
 * @route   POST /api/release-plans/:id/tickets/remove
 * @desc    Remove tickets from release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/tickets/remove', ReleasePlansController.removeTicketsFromReleasePlan);

export default router;
