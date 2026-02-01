"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const projectController_1 = require("@/controllers/projectController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/projects
 * @desc    Get all projects with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, search, status, projectManagerId, sortBy, sortOrder
 */
router.get('/', projectController_1.ProjectController.getProjects);
/**
 * @route   GET /api/projects/selection
 * @desc    Get rich project data for selection screen (tenant-aware + role-based)
 * @access  Private (authenticated users within tenant)
 */
router.get('/selection', projectController_1.ProjectController.getSelectionProjects);
/**
 * @route   GET /api/projects/select
 * @desc    Get projects for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/select', projectController_1.ProjectController.getProjectsForSelect);
/**
 * @route   GET /api/projects/user
 * @desc    Get projects where user is a member (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
// router.get('/user', ProjectController.getUserProjects);
/**
 * @route   GET /api/projects/user-projects
 * @desc    Get projects where user is a member (alias for compatibility)
 * @access  Private (authenticated users within tenant)
 */
router.get('/user-projects', projectController_1.ProjectController.getUserProjects);
/**
 * @route   GET /api/projects/user-projects-for-tickets
 * @desc    Get projects where user is a member or project manager (for ticket creation)
 * @access  Private (authenticated users within tenant)
 */
router.get('/user-projects-for-tickets', projectController_1.ProjectController.getUserProjectsForTickets);
/**
 * @route   GET /api/projects/:id/tickets/my
 * @desc    Get tickets assigned to current user in a project (for daily updates)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/tickets/my', projectController_1.ProjectController.getMyTicketsByProject);
/**
 * @route   GET /api/projects/:id/tickets
 * @desc    Get all tickets for a project that user has access to (for daily updates)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/tickets', projectController_1.ProjectController.getProjectTickets);
/**
 * @route   GET /api/projects/:id/members
 * @desc    Get project members for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/members', projectController_1.ProjectController.getProjectMembers);
/**
 * @route   GET /api/projects/:id/stats
 * @desc    Get project statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/stats', projectController_1.ProjectController.getProjectStats);
/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id', projectController_1.ProjectController.getProjectById);
/**
 * @route   POST /api/projects
 * @desc    Create a new project (tenant-aware)
 * @access  Private (admin or project manager role)
 * @body    CreateProjectData
 */
router.post('/', auth_1.requireAdmin, projectController_1.ProjectController.createProject);
/**
 * @route   PUT /api/projects/:id
 * @desc    Update project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @body    UpdateProjectData
 */
router.put('/:id', projectController_1.ProjectController.updateProject);
/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Project ID
 */
router.delete('/:id', auth_1.requireAdmin, projectController_1.ProjectController.deleteProject);
/**
 * @route   POST /api/projects/:id/team-members
 * @desc    Add team member to project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @body    { userId: string }
 */
router.post('/:id/team-members', projectController_1.ProjectController.addTeamMember);
/**
 * @route   DELETE /api/projects/:id/team-members/:userId
 * @desc    Remove team member from project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @param   userId - User ID to remove
 */
router.delete('/:id/team-members/:userId', projectController_1.ProjectController.removeTeamMember);
exports.default = router;
//# sourceMappingURL=projects.js.map