import { Router } from 'express';
import { UserController } from '@/controllers/userController';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission, requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

router.get('/select', requireAnyPermission(Permissions.USER_READ, Permissions.PROJECT_READ, Permissions.TICKET_READ, Permissions.ATTENDANCE_READ, Permissions.ATTENDANCE_CREATE, Permissions.ATTENDANCE_UPDATE, Permissions.ATTENDANCE_DELETE, Permissions.SQUAD_READ, Permissions.SQUAD_CREATE, Permissions.LEAVE_POLICY_READ, Permissions.LEAVE_POLICY_CREATE, Permissions.LEAVE_MANAGE), UserController.getMembersForSelect);

/**
 * @route   GET /api/members
 * @desc    Get all members/users with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, role, position, isActive, search, sortBy, sortOrder
 */
router.get('/', requireAnyPermission(Permissions.USER_READ, Permissions.PROJECT_READ, Permissions.TICKET_READ, Permissions.ATTENDANCE_READ, Permissions.ATTENDANCE_CREATE, Permissions.ATTENDANCE_UPDATE, Permissions.ATTENDANCE_DELETE, Permissions.SQUAD_READ, Permissions.SQUAD_CREATE, Permissions.LEAVE_POLICY_READ, Permissions.LEAVE_POLICY_CREATE, Permissions.LEAVE_MANAGE), UserController.getMembers);

/**
 * @route   GET /api/members/trash
 * @desc    Get soft-deleted (inactive) members — Member Trash page
 * @access  Private (admin only)
 */
router.get('/trash', requirePermission(Permissions.USER_TRASH_READ), UserController.getDeletedMembers);

/**
 * @route   POST /api/members/trash/bulk-restore
 * @desc    Bulk restore soft-deleted members (tenant-aware)
 * @access  Private (admin only)
 */
router.post('/trash/bulk-restore', requirePermission(Permissions.USER_TRASH_RESTORE), UserController.bulkRestoreMembers);

/**
 * @route   POST /api/members/trash/bulk-permanent-delete
 * @desc    Bulk permanently delete members (tenant-aware)
 * @access  Private (admin only)
 */
router.post('/trash/bulk-permanent-delete', requirePermission(Permissions.USER_TRASH_DELETE), UserController.bulkPermanentDeleteMembers);

/**
 * @route   DELETE /api/members/trash/empty
 * @desc    Empty member trash (tenant-aware)
 * @access  Private (admin only)
 */
router.delete('/trash/empty', requirePermission(Permissions.USER_TRASH_DELETE), UserController.emptyTrashMembers);

/**
 * @route   PATCH /api/members/:id/restore
 * @desc    Restore soft-deleted member (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 */
router.patch('/:id/restore', requirePermission(Permissions.USER_TRASH_RESTORE), UserController.activateMember);

/**
 * @route   DELETE /api/members/:id/permanent
 * @desc    Permanently delete member (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 */
router.delete('/:id/permanent', requirePermission(Permissions.USER_TRASH_DELETE), UserController.permanentlyDeleteMember);

/**
 * @route   GET /api/members/:id
 * @desc    Get member/user by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Member ID
 */
router.get('/:id', requirePermission(Permissions.USER_READ), UserController.getMemberById);

/**
 * @route   POST /api/members
 * @desc    Create new member/user (tenant-aware)
 * @access  Private (admin only)
 * @body    CreateUserData
 */
router.post('/', requirePermission(Permissions.USER_CREATE), UserController.createMember);

/**
 * @route   PUT /api/members/:id
 * @desc    Update member/user (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 * @body    UpdateUserData
 */
router.put('/:id', requirePermission(Permissions.USER_UPDATE), UserController.updateMember);

/**
 * @route   DELETE /api/members/:id
 * @desc    Delete member (soft delete - tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 */
router.delete('/:id', requirePermission(Permissions.USER_DELETE), UserController.deleteMember);

/**
 * @route   PATCH /api/members/:id/activate
 * @desc    Activate member (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 */
router.patch('/:id/activate', requirePermission(Permissions.USER_MANAGE), UserController.activateMember);

/**
 * @route   PATCH /api/members/:id/assign-shift
 * @desc    Assign shift to member (tenant-aware) - RESTORED MISSING FUNCTIONALITY
 * @access  Private (admin only)
 * @param   id - Member ID
 * @body    { shiftId: string }
 */
router.patch('/:id/assign-shift', requirePermission(Permissions.USER_MANAGE), UserController.assignShift);

export default router;
