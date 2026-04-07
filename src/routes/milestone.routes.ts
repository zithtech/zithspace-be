import { Router } from 'express';
import { MilestoneController } from '@/controllers/milestone.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/milestones
 * @desc    Get all milestones for a tenant/project
 * @access  Private
 */
router.get('/', requirePermission(Permissions.PROJECT_READ), MilestoneController.getMilestones);

/**
 * @route   POST /api/milestones
 * @desc    Create a new milestone (Decoupled)
 * @access  Private
 */
router.post('/', requirePermission(Permissions.PROJECT_CREATE), MilestoneController.createMilestone);

/**
 * @route   PUT /api/milestones/:id/sprints
 * @desc    Update milestone sprint assignments
 * @access  Private
 */
router.put('/:id/sprints', requirePermission(Permissions.PROJECT_UPDATE), MilestoneController.updateSprints);

/**
 * @route   PUT /api/milestones/:id
 * @desc    Update milestone
 * @access  Private
 */
router.put('/:id', requirePermission(Permissions.PROJECT_UPDATE), MilestoneController.updateMilestone);

/**
 * @route   DELETE /api/milestones/:id
 * @desc    Delete milestone
 * @access  Private
 */
router.delete('/:id', requirePermission(Permissions.PROJECT_DELETE), MilestoneController.deleteMilestone);

export default router;
