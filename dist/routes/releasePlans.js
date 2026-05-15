"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const releasePlansController_1 = require("@/controllers/releasePlansController");
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
 * @route   GET /api/release-plans/active
 * @desc    Get active release plans (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/active', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_READ), releasePlansController_1.ReleasePlansController.getActiveReleasePlans);
/**
 * @route   GET /api/release-plans/available
 * @desc    Get available sprints (active + planning) for sprint assignment (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId (required)
 */
router.get('/available', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_READ), releasePlansController_1.ReleasePlansController.getAvailableSprints);
/**
 * @route   GET /api/release-plans/stats
 * @desc    Get release plan statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/stats', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_READ), releasePlansController_1.ReleasePlansController.getReleasePlanStats);
/**
 * @route   GET /api/release-plans/projects/:projectId
 * @desc    Get release plans by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 */
router.get('/projects/:projectId', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_READ), releasePlansController_1.ReleasePlansController.getReleasePlansByProject);
/**
 * @route   GET /api/release-plans/tickets/:projectId
 * @desc    Get tickets by project for release plan assignment (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 * @query   search, limit
 */
router.get('/tickets/:projectId', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), releasePlansController_1.ReleasePlansController.getProjectTickets);
/**
 * @route   GET /api/release-plans/:id/available-tickets/:projectId
 * @desc    Get tickets available for assignment to release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @param   projectId - Project ID
 * @query   search, limit, excludeReleasePlan
 */
router.get('/:id/available-tickets/:projectId', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), releasePlansController_1.ReleasePlansController.getAvailableTickets);
/**
 * @route   GET /api/release-plans
 * @desc    Get all release plans with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, projectId, status, search, sortBy, sortOrder
 */
router.get('/', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_READ), releasePlansController_1.ReleasePlansController.getReleasePlans);
/**
 * @route   GET /api/release-plans/:id
 * @desc    Get release plan by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.get('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_READ), releasePlansController_1.ReleasePlansController.getReleasePlanById);
/**
 * @route   POST /api/release-plans
 * @desc    Create new release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { version, description, projectId, releaseDate?, status? }
 */
router.post('/', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_CREATE), releasePlansController_1.ReleasePlansController.createReleasePlan);
/**
 * @route   PUT /api/release-plans/:id
 * @desc    Update release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    Partial release plan data
 */
router.put('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_UPDATE), releasePlansController_1.ReleasePlansController.updateReleasePlan);
/**
 * @route   DELETE /api/release-plans/:id
 * @desc    Delete release plan (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Release plan ID
 */
router.delete('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_DELETE), releasePlansController_1.ReleasePlansController.deleteReleasePlan);
/**
 * @route   POST /api/release-plans/:id/start
 * @desc    Start a sprint (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.post('/:id/start', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_UPDATE), releasePlansController_1.ReleasePlansController.startSprint);
/**
 * @route   POST /api/release-plans/:id/complete
 * @desc    Complete a sprint (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 */
router.post('/:id/complete', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_PLAN_UPDATE), releasePlansController_1.ReleasePlansController.completeSprint);
/**
 * @route   POST /api/release-plans/:id/tickets/assign
 * @desc    Assign tickets to release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/tickets/assign', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_ASSIGN), releasePlansController_1.ReleasePlansController.assignTicketsToReleasePlan);
/**
 * @route   POST /api/release-plans/:id/tickets/remove
 * @desc    Remove tickets from release plan (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release plan ID
 * @body    { ticketIds: string[] }
 */
router.post('/:id/tickets/remove', (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_ASSIGN), releasePlansController_1.ReleasePlansController.removeTicketsFromReleasePlan);
exports.default = router;
//# sourceMappingURL=releasePlans.js.map