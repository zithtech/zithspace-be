"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sprintCompletionController_1 = require("@/controllers/sprintCompletionController");
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
 * @route   GET /api/sprint-completion/:sprintId/summary
 * @desc    Get sprint completion summary (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   sprintId - Sprint Plan ID
 * @returns Sprint details, completed/pending tickets, statistics, available destinations
 */
router.get('/:sprintId/summary', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_READ), sprintCompletionController_1.SprintCompletionController.getSprintCompletionSummary);
/**
 * @route   POST /api/sprint-completion/:sprintId/bulk-resolve
 * @desc    Bulk resolve sprint tickets (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   sprintId - Sprint Plan ID
 * @body    { actions: Array<{ ticketId: string, action: string, destinationId?: string }> }
 * @note    Actions: move_to_sprint, move_to_bucket, move_to_backlog, move_to_trash
 */
router.post('/:sprintId/bulk-resolve', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_MANAGE), sprintCompletionController_1.SprintCompletionController.bulkResolveTickets);
/**
 * @route   POST /api/sprint-completion/:sprintId/complete
 * @desc    Complete sprint with enhanced workflow (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   sprintId - Sprint Plan ID
 * @body    { force?: boolean }
 * @note    Validates all tickets are resolved before completion (unless force=true)
 */
router.post('/:sprintId/complete', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_MANAGE), sprintCompletionController_1.SprintCompletionController.completeSprint);
/**
 * @route   GET /api/sprint-completion/:sprintId/log
 * @desc    Get sprint completion history/audit log (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   sprintId - Sprint Plan ID
 * @query   page, limit
 * @returns Paginated completion logs with action summary
 */
router.get('/:sprintId/log', (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_READ), sprintCompletionController_1.SprintCompletionController.getSprintCompletionLog);
exports.default = router;
//# sourceMappingURL=sprintCompletion.js.map