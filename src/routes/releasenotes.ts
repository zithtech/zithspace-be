import { Router } from 'express';
import ReleaseNotesController from '@/controllers/releasenotesController';
import { authenticateToken, requireAuth, requireAdmin } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/releasenotes
 * @desc    Get all release notes (tenant-aware, paginated, filterable)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, projectId, version, status, search, sortBy, sortOrder
 */
router.get('/', ReleaseNotesController.getReleaseNotes);

/**
 * @route   GET /api/releasenotes/:id
 * @desc    Get release note by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release note ID
 */
router.get('/:id', ReleaseNotesController.getReleaseNoteById);

/**
 * @route   POST /api/releasenotes
 * @desc    Create a new release note (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    CreateReleaseNoteData
 */
router.post('/', ReleaseNotesController.createReleaseNote);

/**
 * @route   PUT /api/releasenotes/:id
 * @desc    Update a release note (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release note ID
 * @body    UpdateReleaseNoteData
 */
router.put('/:id', ReleaseNotesController.updateReleaseNote);

/**
 * @route   DELETE /api/releasenotes/:id
 * @desc    Soft delete a release note (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Release note ID
 */
router.delete('/:id', ReleaseNotesController.deleteReleaseNote);

export default router;
