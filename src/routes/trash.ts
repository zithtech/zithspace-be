import { Router } from 'express';
import { TrashController } from '@/controllers/trashController';
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
 * @route   GET /api/trash
 * @desc    Get all deleted tickets (trash) for a tenant/project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, projectId, search, sortBy, sortOrder
 * @note    Only returns tickets deleted within the last 7 days
 */
router.get('/', TrashController.getTrashTickets);

/**
 * @route   POST /api/trash/move
 * @desc    Move ticket(s) to trash (soft delete) (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { ticketIds: string[] }
 */
router.post('/move', TrashController.moveToTrash);

/**
 * @route   POST /api/trash/restore
 * @desc    Restore ticket(s) from trash (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { ticketIds: string[] }
 */
router.post('/restore', TrashController.restoreFromTrash);

/**
 * @route   DELETE /api/trash/permanent
 * @desc    Permanently delete ticket(s) from trash (tenant-aware)
 * @access  Private (admin only)
 * @body    { ticketIds: string[] }
 * @warning This action cannot be undone
 */
router.delete('/permanent', requirePermission(Permissions.TICKET_MANAGE), TrashController.permanentlyDelete);

/**
 * @route   POST /api/trash/empty
 * @desc    Empty trash - permanently delete all tickets in trash (tenant-aware)
 * @access  Private (admin only)
 * @body    { force?: boolean, projectId?: string }
 * @note    If not forced, only deletes tickets older than 7 days
 */
router.post('/empty', requirePermission(Permissions.TICKET_MANAGE), TrashController.emptyTrash);

/**
 * @route   POST /api/trash/auto-purge
 * @desc    Auto-purge old deleted tickets (called by cron job or manual trigger)
 * @access  Private (admin only)
 * @note    Permanently deletes tickets that have been in trash for more than 7 days
 */
router.post('/auto-purge', requirePermission(Permissions.TICKET_MANAGE), TrashController.autoPurge);

export default router;
