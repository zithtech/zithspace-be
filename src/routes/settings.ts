import { Router } from 'express';
import { SettingsController } from '@/controllers/settingsController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission, requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes commented out for now
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/settings/ticket-configurations
 * @desc    Get all configuration options for ticket creation (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/ticket-configurations', requireAnyPermission(Permissions.TICKET_READ, Permissions.TICKET_SETTING_READ), SettingsController.getTicketConfigurations);

/**
 * @route   GET /api/settings/team-members
 * @desc    Get team members by project or role (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, role, position
 */
router.get('/team-members', requireAnyPermission(Permissions.SETTINGS_READ, Permissions.PROJECT_READ, Permissions.TICKET_READ, Permissions.USER_READ), SettingsController.getTeamMembers);

/**
 * @route   GET /api/settings/release-plans/:projectId
 * @desc    Get release plans by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   projectId - Project ID
 */
router.get('/release-plans/:projectId', requireAnyPermission(Permissions.SETTINGS_READ, Permissions.PROJECT_READ), SettingsController.getReleasePlansByProject);

/**
 * @route   GET /api/settings/workflow-templates
 * @desc    Get workflow templates by project (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId
 */
router.get('/workflow-templates', requireAnyPermission(Permissions.TICKET_READ, Permissions.TICKET_SETTING_READ), SettingsController.getWorkflowTemplates);

/**
 * @route   PUT /api/settings/workflow-templates/:projectId
 * @desc    Update project workflow template (tenant-aware)
 * @access  Private (admin only)
 * @param   projectId - Project ID
 * @body    { workflowSteps: string[] }
 */
router.put('/workflow-templates/:projectId', requireAnyPermission(Permissions.TICKET_SETTING_UPDATE), SettingsController.updateWorkflowTemplate);

/**
 * @route   GET /api/settings/parent-tickets
 * @desc    Get parent tickets for linking (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, exclude, search
 */
router.get('/parent-tickets', requireAnyPermission(Permissions.SETTINGS_READ, Permissions.TICKET_READ), SettingsController.getParentTickets);

/**
 * @route   GET /api/settings/system-stats
 * @desc    Get system statistics for dashboard (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/system-stats', requirePermission(Permissions.SETTINGS_READ), SettingsController.getSystemStats);

/**
 * @route   GET /api/settings/tenant
 * @desc    Get tenant settings (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/tenant', requirePermission(Permissions.SETTINGS_READ), SettingsController.getTenantSettings);

/**
 * @route   PUT /api/settings/tenant
 * @desc    Update tenant settings (admin only - tenant-aware)
 * @access  Private (admin only)
 * @body    { settings: object }
 */
router.put('/tenant', requirePermission(Permissions.SETTINGS_MANAGE), SettingsController.updateTenantSettings);

/**
 * @route   GET /api/settings/search
 * @desc    Search across entities (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   q (search query), limit
 */
router.get('/search', requirePermission(Permissions.SETTINGS_READ), SettingsController.globalSearch);

// ==========================================
// DROPDOWN OPTIONS MANAGEMENT (CRITICAL)
// ==========================================

/**
 * @route   GET /api/settings/dropdown-options
 * @desc    Get all dropdown options grouped by type (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   includeInactive
 */
router.get('/dropdown-options', requireAnyPermission(Permissions.TICKET_SETTING_READ), SettingsController.getDropdownOptions);

/**
 * @route   GET /api/settings/dropdown-options/:type
 * @desc    Get dropdown options by specific type (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   type - Dropdown type (platform, stack, priority, taskLevel, taskType, status)
 * @query   includeInactive
 */
router.get('/dropdown-options/:type', requireAnyPermission(Permissions.TICKET_SETTING_READ), SettingsController.getDropdownOptionsByType);

/**
 * @route   POST /api/settings/dropdown-options
 * @desc    Create a new dropdown option (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { type, value, label, color?, description? }
 */
router.post('/dropdown-options', requireAnyPermission(Permissions.TICKET_SETTING_CREATE, Permissions.TICKET_SETTING_UPDATE), SettingsController.createDropdownOption);

/**
 * @route   PUT /api/settings/dropdown-options/reorder
 * @desc    Reorder dropdown options (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { items: [{ id, order }] }
 */
router.put('/dropdown-options/reorder', requireAnyPermission(Permissions.TICKET_SETTING_UPDATE), SettingsController.reorderDropdownOptions);

/**
 * @route   PUT /api/settings/dropdown-options/:id
 * @desc    Update an existing dropdown option (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Dropdown option ID
 * @body    { value, label, color?, description?, isActive? }
 */
router.put('/dropdown-options/:id', requireAnyPermission(Permissions.TICKET_SETTING_UPDATE), SettingsController.updateDropdownOption);

/**
 * @route   DELETE /api/settings/dropdown-options/:id
 * @desc    Delete a dropdown option (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Dropdown option ID
 */
router.delete('/dropdown-options/:id', requireAnyPermission(Permissions.TICKET_SETTING_DELETE, Permissions.TICKET_SETTING_UPDATE), SettingsController.deleteDropdownOption);

export default router;
