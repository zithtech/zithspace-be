import { Router } from 'express';
import { ReleasePlansController } from '@/controllers/releasePlansController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
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
router.get('/active', requirePermission(Permissions.TICKET_PLAN_READ), ReleasePlansController.getActiveReleasePlans);

/**
 * @route   GET /api/release-plans/available
 * @desc    Get available sprints (active + planning) for sprint assignment (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId (required)
 */
router.get('/available', requirePermission(Permissions.TICKET_PLAN_READ), ReleasePlansController.getAvailableSprints);

/**
 * @route   GET /api/release-plans/stats
 * @desc    Get release plan statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/stats', requirePermission(Permissions.TICKET_PLAN_READ), ReleasePlansController.getReleasePlanStats);

/**
 * @route   GET /api/release-plans/projects/:projectId
 * @desc    Get release plans by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 */
router.get('/projects/:projectId', requirePermission(Permissions.TICKET_PLAN_READ), ReleasePlansController.getReleasePlansByProject);

/**
 * @route   GET /api/release-plans/tickets/:projectId
 * @desc    Get tickets by project for release plan assignment (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 * @query   search, limit
 */
router.get('/tickets/:projectId', requirePermission(Permissions.TICKET_READ), ReleasePlansController.getProjectTickets);

/**
 * @route   GET /api/release-plans/:id/available-tickets/:projectId
 * @desc    Get tickets available for assignment to release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @param   projectId - Project ID
 * @query   search, limit, excludeReleasePlan
 */
router.get('/:id/available-tickets/:projectId', requirePermission(Permissions.TICKET_READ), ReleasePlansController.getAvailableTickets);

/**
 * @route   GET /api/release-plans
 * @desc    Get all release plans with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, projectId, status, search, sortBy, sortOrder
 */
router.get('/', requirePermission(Permissions.TICKET_PLAN_READ), ReleasePlansController.getReleasePlans);

/**
 * @route   GET /api/release-plans/:id
 * @desc    Get release plan by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.get('/:id', requirePermission(Permissions.TICKET_PLAN_READ), ReleasePlansController.getReleasePlanById);

/**
 * @route   POST /api/release-plans
 * @desc    Create new release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { version, description, projectId, releaseDate?, status? }
 */
router.post('/', requirePermission(Permissions.TICKET_PLAN_CREATE), ReleasePlansController.createReleasePlan);

/**
 * @route   PUT /api/release-plans/:id
 * @desc    Update release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    Partial release plan data
 */
router.put('/:id', requirePermission(Permissions.TICKET_PLAN_UPDATE), ReleasePlansController.updateReleasePlan);

/**
 * @route   DELETE /api/release-plans/:id
 * @desc    Delete release plan (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Release plan ID
 */
router.delete('/:id', requirePermission(Permissions.TICKET_PLAN_DELETE), ReleasePlansController.deleteReleasePlan);

/**
 * @route   POST /api/release-plans/:id/start
 * @desc    Start a sprint (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.post('/:id/start', requirePermission(Permissions.TICKET_PLAN_UPDATE), ReleasePlansController.startSprint);

/**
 * @route   POST /api/release-plans/:id/complete
 * @desc    Complete a sprint (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.post('/:id/complete', requirePermission(Permissions.TICKET_PLAN_UPDATE), ReleasePlansController.completeSprint);

/**
 * @route   POST /api/release-plans/:id/tickets/assign
 * @desc    Assign tickets to release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/tickets/assign', requirePermission(Permissions.TICKET_ASSIGN), ReleasePlansController.assignTicketsToReleasePlan);

/**
 * @route   POST /api/release-plans/:id/tickets/remove
 * @desc    Remove tickets from release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/tickets/remove', requirePermission(Permissions.TICKET_ASSIGN), ReleasePlansController.removeTicketsFromReleasePlan);

export default router;
