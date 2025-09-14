"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shiftsController_1 = require("@/controllers/shiftsController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/shifts/select
 * @desc    Get shifts for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/select', shiftsController_1.ShiftsController.getShiftsForSelect);
/**
 * @route   GET /api/shifts/:shiftId/users
 * @desc    Get users assigned to a specific shift (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   shiftId - Shift ID
 */
router.get('/:shiftId/users', shiftsController_1.ShiftsController.getUsersByShift);
/**
 * @route   GET /api/shifts
 * @desc    Get all shifts with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, isActive, search, sortBy, sortOrder
 */
router.get('/', shiftsController_1.ShiftsController.getShifts);
/**
 * @route   GET /api/shifts/:id
 * @desc    Get shift by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Shift ID
 */
router.get('/:id', shiftsController_1.ShiftsController.getShiftById);
/**
 * @route   POST /api/shifts
 * @desc    Create new shift (tenant-aware)
 * @access  Private (admin only)
 * @body    { name, startTime, endTime }
 */
router.post('/', auth_1.requireAdmin, shiftsController_1.ShiftsController.createShift);
/**
 * @route   PUT /api/shifts/:id
 * @desc    Update shift (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Shift ID
 * @body    { name?, startTime?, endTime?, isActive? }
 */
router.put('/:id', auth_1.requireAdmin, shiftsController_1.ShiftsController.updateShift);
/**
 * @route   DELETE /api/shifts/:id
 * @desc    Delete shift (soft delete - tenant-aware)
 * @access  Private (admin only)
 * @param   id - Shift ID
 */
router.delete('/:id', auth_1.requireAdmin, shiftsController_1.ShiftsController.deleteShift);
/**
 * @route   PATCH /api/shifts/:id/activate
 * @desc    Activate shift (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Shift ID
 */
router.patch('/:id/activate', auth_1.requireAdmin, shiftsController_1.ShiftsController.activateShift);
/**
 * @route   POST /api/shifts/:shiftId/assign
 * @desc    Assign shift to user (tenant-aware)
 * @access  Private (admin only)
 * @param   shiftId - Shift ID
 * @body    { userId }
 */
router.post('/:shiftId/assign', auth_1.requireAdmin, shiftsController_1.ShiftsController.assignShiftToUser);
/**
 * @route   DELETE /api/shifts/users/:userId/remove
 * @desc    Remove shift assignment from user (tenant-aware)
 * @access  Private (admin only)
 * @param   userId - User ID
 */
router.delete('/users/:userId/remove', auth_1.requireAdmin, shiftsController_1.ShiftsController.removeShiftFromUser);
exports.default = router;
//# sourceMappingURL=shifts.js.map