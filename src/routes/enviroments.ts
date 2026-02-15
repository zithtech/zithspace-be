import { Router } from 'express';
import EnviromentsController from '@/controllers/enviromentsController';
import { authenticateToken, requireAuth, requireAdmin } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/enviroments
 * @desc    Get all environments (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/', EnviromentsController.getEnviroments);

/**
 * @route   GET /api/enviroments/:id
 * @desc    Get single environment
 * @access  Private
 */
router.get('/:id', EnviromentsController.getEnviromentById);

/**
 * @route   POST /api/enviroments
 * @desc    Create environment
 * @access  Private (admin only)
 * @body    { name, code, status }
 */
router.post('/',EnviromentsController.createEnviroment);

/**
 * @route   PUT /api/enviroments/:id
 * @desc    Update environment
 * @access  Private (admin only)
 */
router.put('/:id', EnviromentsController.updateEnviroment);

/**
 * @route   DELETE /api/enviroments/:id
 * @desc    Delete (soft delete) environment
 * @access  Private (admin only)
 */
router.delete('/:id',  EnviromentsController.deleteEnviroment);

export default router;
