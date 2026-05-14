import { Router } from 'express';
import { ProjectController } from '@/controllers/projectController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission, requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();


router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/projects
 * @desc    Get all projects with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, search, status, projectManagerId, sortBy, sortOrder
 */
router.get('/', requirePermission(Permissions.PROJECT_READ), ProjectController.getProjects);

/**
 * @route   GET /api/projects/selection
 * @desc    Get rich project data for selection screen (tenant-aware + role-based)
 * @access  Private (authenticated users within tenant)
 */
router.get('/selection', requirePermission(Permissions.PROJECT_READ), ProjectController.getSelectionProjects);

/**
 * @route   GET /api/projects/select
 * @desc    Get projects for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/select', requireAnyPermission(Permissions.PROJECT_READ, Permissions.ATTENDANCE_READ, Permissions.ATTENDANCE_CREATE, Permissions.ATTENDANCE_UPDATE, Permissions.ATTENDANCE_DELETE), ProjectController.getProjectsForSelect);

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
router.get('/user-projects', requirePermission(Permissions.PROJECT_READ), ProjectController.getUserProjects);

/**
 * @route   GET /api/projects/user-projects-for-tickets
 * @desc    Get projects where user is a member or project manager (for ticket creation)
 * @access  Private (authenticated users within tenant)
 */
router.get('/user-projects-for-tickets', requirePermission(Permissions.PROJECT_READ), ProjectController.getUserProjectsForTickets);

// Trash routes
router.get('/trash', requirePermission(Permissions.PROJECT_TRASH_READ), ProjectController.getTrashProjects);
router.delete('/trash/empty', requirePermission(Permissions.PROJECT_TRASH_DELETE), ProjectController.emptyTrash);
router.post('/trash/bulk-restore', requirePermission(Permissions.PROJECT_TRASH_RESTORE), ProjectController.bulkRestoreProjects);
router.post('/trash/bulk-permanent-delete', requirePermission(Permissions.PROJECT_TRASH_DELETE), ProjectController.bulkPermanentDeleteProjects);
router.post('/:id/restore', requirePermission(Permissions.PROJECT_TRASH_RESTORE), ProjectController.restoreProject);
router.delete('/:id/permanent', requirePermission(Permissions.PROJECT_TRASH_DELETE), ProjectController.permanentDeleteProject);

/**
 * @route   GET /api/projects/:id/tickets/my
 * @desc    Get tickets assigned to current user in a project (for daily updates)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/tickets/my', requirePermission(Permissions.PROJECT_READ), ProjectController.getMyTicketsByProject);

/**
 * @route   GET /api/projects/:id/tickets
 * @desc    Get all tickets for a project that user has access to (for daily updates)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/tickets', requirePermission(Permissions.PROJECT_READ), ProjectController.getProjectTickets);

/**
 * @route   GET /api/projects/:id/members
 * @desc    Get project members for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/members', requirePermission(Permissions.PROJECT_READ), ProjectController.getProjectMembers);

/**
 * @route   GET /api/projects/:id/stats
 * @desc    Get project statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/stats', requirePermission(Permissions.PROJECT_READ), ProjectController.getProjectStats);

/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id', requirePermission(Permissions.PROJECT_READ), ProjectController.getProjectById);

/**
 * @route   POST /api/projects
 * @desc    Create a new project (tenant-aware)
 * @access  Private (admin or project manager role)
 * @body    CreateProjectData
 */
router.post('/', requirePermission(Permissions.PROJECT_CREATE), ProjectController.createProject);

/**
 * @route   PUT /api/projects/:id
 * @desc    Update project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @body    UpdateProjectData
 */
router.put('/:id', requirePermission(Permissions.PROJECT_UPDATE), ProjectController.updateProject);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Project ID
 */
router.delete('/:id', requirePermission(Permissions.PROJECT_DELETE), ProjectController.deleteProject);

/**
 * @route   POST /api/projects/:id/team-members
 * @desc    Add team member to project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @body    { userId: string }
 */
router.post('/:id/team-members', requirePermission(Permissions.PROJECT_MANAGE), ProjectController.addTeamMember);

/**
 * @route   DELETE /api/projects/:id/team-members/:userId
 * @desc    Remove team member from project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @param   userId - User ID to remove
 */
router.delete('/:id/team-members/:userId', requirePermission(Permissions.PROJECT_MANAGE), ProjectController.removeTeamMember);





export default router;
