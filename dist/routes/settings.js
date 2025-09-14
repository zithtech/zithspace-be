"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController_1 = require("@/controllers/settingsController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/settings/ticket-configurations
 * @desc    Get all configuration options for ticket creation (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/ticket-configurations', settingsController_1.SettingsController.getTicketConfigurations);
/**
 * @route   GET /api/settings/team-members
 * @desc    Get team members by project or role (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, role, position
 */
router.get('/team-members', settingsController_1.SettingsController.getTeamMembers);
/**
 * @route   GET /api/settings/release-plans/:projectId
 * @desc    Get release plans by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 */
router.get('/release-plans/:projectId', settingsController_1.SettingsController.getReleasePlansByProject);
/**
 * @route   GET /api/settings/workflow-templates
 * @desc    Get workflow templates by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId
 */
router.get('/workflow-templates', settingsController_1.SettingsController.getWorkflowTemplates);
/**
 * @route   PUT /api/settings/workflow-templates/:projectId
 * @desc    Update project workflow template (tenant-aware)
 * @access  Private (admin only)
 * @param   projectId - Project ID
 * @body    { workflowSteps: string[] }
 */
router.put('/workflow-templates/:projectId', auth_1.requireAdmin, settingsController_1.SettingsController.updateWorkflowTemplate);
/**
 * @route   GET /api/settings/parent-tickets
 * @desc    Get parent tickets for linking (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, exclude, search
 */
router.get('/parent-tickets', settingsController_1.SettingsController.getParentTickets);
/**
 * @route   GET /api/settings/system-stats
 * @desc    Get system statistics for dashboard (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/system-stats', settingsController_1.SettingsController.getSystemStats);
/**
 * @route   GET /api/settings/tenant
 * @desc    Get tenant settings (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/tenant', settingsController_1.SettingsController.getTenantSettings);
/**
 * @route   PUT /api/settings/tenant
 * @desc    Update tenant settings (admin only - tenant-aware)
 * @access  Private (admin only)
 * @body    { settings: object }
 */
router.put('/tenant', auth_1.requireAdmin, settingsController_1.SettingsController.updateTenantSettings);
/**
 * @route   GET /api/settings/search
 * @desc    Search across entities (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   q (search query), limit
 */
router.get('/search', settingsController_1.SettingsController.globalSearch);
exports.default = router;
//# sourceMappingURL=settings.js.map