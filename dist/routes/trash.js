"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const trashController_1 = require("@/controllers/trashController");
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/trash
 * @desc    Get all deleted tickets (trash) for a tenant/project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, projectId, search, sortBy, sortOrder
 * @note    Only returns tickets deleted within the last 7 days
 */
router.get('/', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), trashController_1.TrashController.getTrashTickets);
/**
 * @route   POST /api/trash/move
 * @desc    Move ticket(s) to trash (soft delete) (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { ticketIds: string[] }
 */
router.post('/move', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), trashController_1.TrashController.moveToTrash);
/**
 * @route   POST /api/trash/restore
 * @desc    Restore ticket(s) from trash (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { ticketIds: string[] }
 */
router.post('/restore', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), trashController_1.TrashController.restoreFromTrash);
/**
 * @route   DELETE /api/trash/permanent
 * @desc    Permanently delete ticket(s) from trash (tenant-aware)
 * @access  Private (admin only)
 * @body    { ticketIds: string[] }
 * @warning This action cannot be undone
 */
router.delete('/permanent', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_MANAGE), trashController_1.TrashController.permanentlyDelete);
/**
 * @route   POST /api/trash/empty
 * @desc    Empty trash - permanently delete all tickets in trash (tenant-aware)
 * @access  Private (admin only)
 * @body    { force?: boolean, projectId?: string }
 * @note    If not forced, only deletes tickets older than 7 days
 */
router.post('/empty', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_MANAGE), trashController_1.TrashController.emptyTrash);
/**
 * @route   POST /api/trash/auto-purge
 * @desc    Auto-purge old deleted tickets (called by cron job or manual trigger)
 * @access  Private (admin only)
 * @note    Permanently deletes tickets that have been in trash for more than 7 days
 */
router.post('/auto-purge', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_MANAGE), trashController_1.TrashController.autoPurge);
exports.default = router;
//# sourceMappingURL=trash.js.map