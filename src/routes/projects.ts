import { Router } from 'express';
import { ProjectController } from '@/controllers/projectController';
import { authenticateToken, requireAuth, requireAdmin } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
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
router.get('/', ProjectController.getProjects);

/**
 * @route   GET /api/projects/select
 * @desc    Get projects for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/select', ProjectController.getProjectsForSelect);

/**
 * @route   GET /api/projects/user
 * @desc    Get projects where user is a member (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/user', ProjectController.getUserProjects);

/**
 * @route   GET /api/projects/user-projects
 * @desc    Get projects where user is a member (alias for compatibility)
 * @access  Private (authenticated users within tenant)
 */
router.get('/user-projects', ProjectController.getUserProjects);

/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id', ProjectController.getProjectById);

/**
 * @route   GET /api/projects/:id/stats
 * @desc    Get project statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Project ID
 */
router.get('/:id/stats', ProjectController.getProjectStats);

/**
 * @route   POST /api/projects
 * @desc    Create a new project (tenant-aware)
 * @access  Private (admin or project manager role)
 * @body    CreateProjectData
 */
router.post('/', requireAdmin, ProjectController.createProject);

/**
 * @route   PUT /api/projects/:id
 * @desc    Update project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @body    UpdateProjectData
 */
router.put('/:id', ProjectController.updateProject);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Project ID
 */
router.delete('/:id', requireAdmin, ProjectController.deleteProject);

/**
 * @route   POST /api/projects/:id/team-members
 * @desc    Add team member to project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @body    { userId: string }
 */
router.post('/:id/team-members', ProjectController.addTeamMember);

/**
 * @route   DELETE /api/projects/:id/team-members/:userId
 * @desc    Remove team member from project (tenant-aware)
 * @access  Private (admin or project manager of the project)
 * @param   id - Project ID
 * @param   userId - User ID to remove
 */
router.delete('/:id/team-members/:userId', ProjectController.removeTeamMember);

export default router;
