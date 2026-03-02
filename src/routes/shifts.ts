import { Router } from 'express';
import { ShiftsController } from '@/controllers/shiftsController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/shifts/select
 * @desc    Get shifts for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/select', ShiftsController.getShiftsForSelect);

/**
 * @route   GET /api/shifts/:shiftId/users
 * @desc    Get users assigned to a specific shift (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   shiftId - Shift ID
 */
router.get('/:shiftId/users', ShiftsController.getUsersByShift);

/**
 * @route   GET /api/shifts
 * @desc    Get all shifts with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, isActive, search, sortBy, sortOrder
 */
router.get('/', ShiftsController.getShifts);

/**
 * @route   GET /api/shifts/:id
 * @desc    Get shift by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Shift ID
 */
router.get('/:id', ShiftsController.getShiftById);

/**
 * @route   POST /api/shifts
 * @desc    Create new shift (tenant-aware)
 * @access  Private (admin only)
 * @body    { name, startTime, endTime }
 */
router.post('/', requirePermission(Permissions.SHIFT_CREATE), ShiftsController.createShift);

/**
 * @route   PUT /api/shifts/:id
 * @desc    Update shift (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Shift ID
 * @body    { name?, startTime?, endTime?, isActive? }
 */
router.put('/:id', requirePermission(Permissions.SHIFT_UPDATE), ShiftsController.updateShift);

/**
 * @route   DELETE /api/shifts/:id
 * @desc    Delete shift (soft delete - tenant-aware)
 * @access  Private (admin only)
 * @param   id - Shift ID
 */
router.delete('/:id', requirePermission(Permissions.SHIFT_DELETE), ShiftsController.deleteShift);

/**
 * @route   PATCH /api/shifts/:id/activate
 * @desc    Activate shift (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Shift ID
 */
router.patch('/:id/activate', requirePermission(Permissions.SHIFT_MANAGE), ShiftsController.activateShift);

/**
 * @route   POST /api/shifts/:shiftId/assign
 * @desc    Assign shift to user (tenant-aware)
 * @access  Private (admin only)
 * @param   shiftId - Shift ID
 * @body    { userId }
 */
router.post('/:shiftId/assign', requirePermission(Permissions.SHIFT_MANAGE), ShiftsController.assignShiftToUser);

/**
 * @route   DELETE /api/shifts/users/:userId/remove
 * @desc    Remove shift assignment from user (tenant-aware)
 * @access  Private (admin only)
 * @param   userId - User ID
 */
router.delete('/users/:userId/remove', requirePermission(Permissions.SHIFT_MANAGE), ShiftsController.removeShiftFromUser);

export default router;
