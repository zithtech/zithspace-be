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
/**
 * @route   GET /api/members/select
 * @desc    Get members for dropdown/select (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   role, position
 */
router.get('/select', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_READ), userController_1.UserController.getMembersForSelect);
/**
 * @route   GET /api/members
 * @desc    Get all members/users with filtering and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, role, position, isActive, search, sortBy, sortOrder
 */
router.get('/', (0, permission_1.requirePermission)(permissions_1.Permissions.USER_READ), userController_1.UserController.getMembers);
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
exports.default = router;
//# sourceMappingURL=members.js.map