"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("@/controllers/userController");
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.get('/select', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.USER_READ, permissions_1.Permissions.PROJECT_READ, permissions_1.Permissions.TICKET_READ, permissions_1.Permissions.ATTENDANCE_READ, permissions_1.Permissions.ATTENDANCE_CREATE, permissions_1.Permissions.ATTENDANCE_UPDATE, permissions_1.Permissions.ATTENDANCE_DELETE, permissions_1.Permissions.SQUAD_READ, permissions_1.Permissions.SQUAD_CREATE, permissions_1.Permissions.LEAVE_POLICY_READ, permissions_1.Permissions.LEAVE_POLICY_CREATE, permissions_1.Permissions.LEAVE_MANAGE), userController_1.UserController.getMembersForSelect);
/**
 * @route   GET /api/members
 * @desc    Get all members/users with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, role, position, isActive, search, sortBy, sortOrder
 */
router.get('/', (0, permission_1.requireAnyPermission)(permissions_1.Permissions.USER_READ, permissions_1.Permissions.PROJECT_READ, permissions_1.Permissions.TICKET_READ, permissions_1.Permissions.ATTENDANCE_READ, permissions_1.Permissions.ATTENDANCE_CREATE, permissions_1.Permissions.ATTENDANCE_UPDATE, permissions_1.Permissions.ATTENDANCE_DELETE, permissions_1.Permissions.SQUAD_READ, permissions_1.Permissions.SQUAD_CREATE, permissions_1.Permissions.LEAVE_POLICY_READ, permissions_1.Permissions.LEAVE_POLICY_CREATE, permissions_1.Permissions.LEAVE_MANAGE), userController_1.UserController.getMembers);
/**
 * @route   GET /api/members/trash
 * @desc    Get soft-deleted (inactive) members — Member Trash page
 * @access  Private (admin only)
 */
router.get('/trash', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_TRASH_READ), userController_1.UserController.getDeletedMembers);
/**
 * @route   POST /api/members/trash/bulk-restore
 * @desc    Bulk restore soft-deleted members (tenant-aware)
 * @access  Private (admin only)
 */
router.post('/trash/bulk-restore', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_TRASH_RESTORE), userController_1.UserController.bulkRestoreMembers);
/**
 * @route   POST /api/members/trash/bulk-permanent-delete
 * @desc    Bulk permanently delete members (tenant-aware)
 * @access  Private (admin only)
 */
router.post('/trash/bulk-permanent-delete', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_TRASH_DELETE), userController_1.UserController.bulkPermanentDeleteMembers);
/**
 * @route   DELETE /api/members/trash/empty
 * @desc    Empty member trash (tenant-aware)
 * @access  Private (admin only)
 */
router.delete('/trash/empty', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_TRASH_DELETE), userController_1.UserController.emptyTrashMembers);
/**
 * @route   PATCH /api/members/:id/restore
 * @desc    Restore soft-deleted member (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 */
router.patch('/:id/restore', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_TRASH_RESTORE), userController_1.UserController.activateMember);
/**
 * @route   DELETE /api/members/:id/permanent
 * @desc    Permanently delete member (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 */
router.delete('/:id/permanent', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_TRASH_DELETE), userController_1.UserController.permanentlyDeleteMember);
/**
 * @route   GET /api/members/:id
 * @desc    Get member/user by ID (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Member ID
 */
router.get('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_READ), userController_1.UserController.getMemberById);
/**
 * @route   POST /api/members
 * @desc    Create new member/user (tenant-aware)
 * @access  Private (admin only)
 * @body    CreateUserData
 */
router.post('/', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_CREATE), userController_1.UserController.createMember);
/**
 * @route   PUT /api/members/:id
 * @desc    Update member/user (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 * @body    UpdateUserData
 */
router.put('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_UPDATE), userController_1.UserController.updateMember);
/**
 * @route   DELETE /api/members/:id
 * @desc    Delete member (soft delete - tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 */
router.delete('/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_DELETE), userController_1.UserController.deleteMember);
/**
 * @route   PATCH /api/members/:id/activate
 * @desc    Activate member (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Member ID
 */
router.patch('/:id/activate', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_MANAGE), userController_1.UserController.activateMember);
/**
 * @route   PATCH /api/members/:id/assign-shift
 * @desc    Assign shift to member (tenant-aware) - RESTORED MISSING FUNCTIONALITY
 * @access  Private (admin only)
 * @param   id - Member ID
 * @body    { shiftId: string }
 */
router.patch('/:id/assign-shift', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_MANAGE), userController_1.UserController.assignShift);
/**
 * @route   PATCH /api/members/:id/ai-access
 * @desc    Toggle a member's AI access (users.ai_enabled)
 * @access  Private (admin only)
 * @body    { enabled: boolean }
 */
router.patch('/:id/ai-access', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_MANAGE), userController_1.UserController.setAiAccess);
exports.default = router;
//# sourceMappingURL=members.js.map