import { Router } from 'express';
import { UserController } from '@/controllers/userController';
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
 * @route   GET /api/members/select
 * @desc    Get members for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   role, position
 */
router.get('/select', requirePermission(Permissions.USER_READ), UserController.getMembersForSelect);

/**
 * @route   GET /api/members
 * @desc    Get all members/users with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, role, position, isActive, search, sortBy, sortOrder
 */
router.get('/', requirePermission(Permissions.USER_READ), UserController.getMembers);

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
