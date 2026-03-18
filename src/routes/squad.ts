import { Router } from 'express';
import { SquadController } from '@/controllers/squadController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/squads
 * @desc    Get all squads with filtering (tenant-aware)
 */
router.get('/', requirePermission(Permissions.SQUAD_READ), SquadController.getSquads);

/**
 * @route   GET /api/squads/:id
 * @desc    Get squad by ID
 */
router.get('/:id', requirePermission(Permissions.SQUAD_READ), SquadController.getSquadById);

/**
 * @route   POST /api/squads
 * @desc    Create a new squad
 */
router.post('/', requirePermission(Permissions.SQUAD_CREATE), SquadController.createSquad);

/**
 * @route   PUT /api/squads/:id
 * @desc    Update squad
 */
router.put('/:id', requirePermission(Permissions.SQUAD_UPDATE), SquadController.updateSquad);

/**
 * @route   DELETE /api/squads/:id
 * @desc    Delete squad (soft delete)
 */
router.delete('/:id', requirePermission(Permissions.SQUAD_DELETE), SquadController.deleteSquad);

/**
 * @route   PATCH /api/squads/:id/archive
 * @desc    Archive/Unarchive squad
 */
router.patch('/:id/archive', requirePermission(Permissions.SQUAD_UPDATE), SquadController.archiveSquad);

export default router;
