"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController_1 = require("@/controllers/settingsController");
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes commented out for now
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/settings/ticket-configurations
 * @desc    Get all configuration options for ticket creation (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/ticket-configurations', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_READ, permissions_1.Permissions.TICKET_SETTING_READ), settingsController_1.SettingsController.getTicketConfigurations);
/**
 * @route   GET /api/settings/team-members
 * @desc    Get team members by project or role (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, role, position
 */
router.get('/team-members', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.SETTINGS_READ, permissions_1.Permissions.PROJECT_READ, permissions_1.Permissions.TICKET_READ, permissions_1.Permissions.USER_READ), settingsController_1.SettingsController.getTeamMembers);
/**
 * @route   GET /api/settings/release-plans/:projectId
 * @desc    Get release plans by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 */
router.get('/release-plans/:projectId', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.SETTINGS_READ, permissions_1.Permissions.PROJECT_READ), settingsController_1.SettingsController.getReleasePlansByProject);
/**
 * @route   GET /api/settings/workflow-templates
 * @desc    Get workflow templates by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId
 */
router.get('/workflow-templates', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_READ, permissions_1.Permissions.TICKET_SETTING_READ), settingsController_1.SettingsController.getWorkflowTemplates);
/**
 * @route   PUT /api/settings/workflow-templates/:projectId
 * @desc    Update project workflow template (tenant-aware)
 * @access  Private (admin only)
 * @param   projectId - Project ID
 * @body    { workflowSteps: string[] }
 */
router.put('/workflow-templates/:projectId', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_SETTING_UPDATE), settingsController_1.SettingsController.updateWorkflowTemplate);
/**
 * @route   GET /api/settings/parent-tickets
 * @desc    Get parent tickets for linking (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, exclude, search
 */
router.get('/parent-tickets', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.SETTINGS_READ, permissions_1.Permissions.TICKET_READ), settingsController_1.SettingsController.getParentTickets);
/**
 * @route   GET /api/settings/system-stats
 * @desc    Get system statistics for dashboard (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/system-stats', (0, permission_1.requirePermission)(permissions_1.Permissions.SETTINGS_READ), settingsController_1.SettingsController.getSystemStats);
/**
 * @route   GET /api/settings/tenant
 * @desc    Get tenant settings (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/tenant', (0, permission_1.requirePermission)(permissions_1.Permissions.SETTINGS_READ), settingsController_1.SettingsController.getTenantSettings);
/**
 * @route   PUT /api/settings/tenant
 * @desc    Update tenant settings (admin only - tenant-aware)
 * @access  Private (admin only)
 * @body    { settings: object }
 */
router.put('/tenant', (0, permission_1.requirePermission)(permissions_1.Permissions.SETTINGS_MANAGE), settingsController_1.SettingsController.updateTenantSettings);
/**
 * @route   GET /api/settings/search
 * @desc    Search across entities (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   q (search query), limit
 */
router.get('/search', (0, permission_1.requirePermission)(permissions_1.Permissions.SETTINGS_READ), settingsController_1.SettingsController.globalSearch);
// ==========================================
// DROPDOWN OPTIONS MANAGEMENT (CRITICAL)
// ==========================================
/**
 * @route   GET /api/settings/dropdown-options
 * @desc    Get all dropdown options grouped by type (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   includeInactive
 */
router.get('/dropdown-options', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_SETTING_READ), settingsController_1.SettingsController.getDropdownOptions);
/**
 * @route   GET /api/settings/dropdown-options/:type
 * @desc    Get dropdown options by specific type (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   type - Dropdown type (platform, stack, priority, taskLevel, taskType, status)
 * @query   includeInactive
 */
router.get('/dropdown-options/:type', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_SETTING_READ), settingsController_1.SettingsController.getDropdownOptionsByType);
/**
 * @route   POST /api/settings/dropdown-options
 * @desc    Create a new dropdown option (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { type, value, label, color?, description? }
 */
router.post('/dropdown-options', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_SETTING_CREATE, permissions_1.Permissions.TICKET_SETTING_UPDATE), settingsController_1.SettingsController.createDropdownOption);
/**
 * @route   PUT /api/settings/dropdown-options/reorder
 * @desc    Reorder dropdown options (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { items: [{ id, order }] }
 */
router.put('/dropdown-options/reorder', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_SETTING_UPDATE), settingsController_1.SettingsController.reorderDropdownOptions);
/**
 * @route   PUT /api/settings/dropdown-options/:id
 * @desc    Update an existing dropdown option (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Dropdown option ID
 * @body    { value, label, color?, description?, isActive? }
 */
router.put('/dropdown-options/:id', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_SETTING_UPDATE), settingsController_1.SettingsController.updateDropdownOption);
/**
 * @route   DELETE /api/settings/dropdown-options/:id
 * @desc    Delete a dropdown option (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Dropdown option ID
 */
router.delete('/dropdown-options/:id', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.TICKET_SETTING_DELETE, permissions_1.Permissions.TICKET_SETTING_UPDATE), settingsController_1.SettingsController.deleteDropdownOption);
exports.default = router;
//# sourceMappingURL=settings.js.map