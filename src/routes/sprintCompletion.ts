import { Router } from 'express';
import { SprintCompletionController } from '@/controllers/sprintCompletionController';
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
 * @route   GET /api/sprint-completion/:sprintId/summary
 * @desc    Get sprint completion summary (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   sprintId - Sprint Plan ID
 * @returns Sprint details, completed/pending tickets, statistics, available destinations
 */
router.get('/:sprintId/summary', requirePermission(Permissions.PROJECT_READ), SprintCompletionController.getSprintCompletionSummary);

/**
 * @route   POST /api/sprint-completion/:sprintId/bulk-resolve
 * @desc    Bulk resolve sprint tickets (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   sprintId - Sprint Plan ID
 * @body    { actions: Array<{ ticketId: string, action: string, destinationId?: string }> }
 * @note    Actions: move_to_sprint, move_to_bucket, move_to_backlog, move_to_trash
 */
router.post('/:sprintId/bulk-resolve', requirePermission(Permissions.TICKET_MANAGE), SprintCompletionController.bulkResolveTickets);

/**
 * @route   POST /api/sprint-completion/:sprintId/complete
 * @desc    Complete sprint with enhanced workflow (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   sprintId - Sprint Plan ID
 * @body    { force?: boolean }
 * @note    Validates all tickets are resolved before completion (unless force=true)
 */
router.post('/:sprintId/complete', requirePermission(Permissions.PROJECT_MANAGE), SprintCompletionController.completeSprint);

/**
 * @route   GET /api/sprint-completion/:sprintId/log
 * @desc    Get sprint completion history/audit log (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   sprintId - Sprint Plan ID
 * @query   page, limit
 * @returns Paginated completion logs with action summary
 */
router.get('/:sprintId/log', requirePermission(Permissions.PROJECT_READ), SprintCompletionController.getSprintCompletionLog);

export default router;
