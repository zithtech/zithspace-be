import { Router } from 'express';
import { ProjectOverviewController } from '@/controllers/projectOverviewController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/projects/:projectId/overview
 * @desc    Get comprehensive project overview data
 * @access  Private (authenticated users)
 */
router.get('/:projectId/overview', requirePermission(Permissions.PROJECT_READ), ProjectOverviewController.getOverview);

/**
 * @route   GET /api/projects/:projectId/timeline
 * @desc    Get all project tickets for the timeline view (loaded on demand)
 * @access  Private (authenticated users)
 */
router.get('/:projectId/timeline', requirePermission(Permissions.PROJECT_READ), ProjectOverviewController.getTimeline);

/**
 * @route   PUT /api/projects/:projectId/overview
 * @desc    Update project basic details
 * @access  Private (project managers/admins)
 */
router.put('/:projectId/overview', requirePermission(Permissions.PROJECT_UPDATE), ProjectOverviewController.updateProject);

/**
 * @route   DELETE /api/projects/:projectId/overview
 * @desc    Delete project
 * @access  Private (admins only)
 */
router.delete('/:projectId/overview', requirePermission(Permissions.PROJECT_DELETE), ProjectOverviewController.deleteProject);

export default router;
