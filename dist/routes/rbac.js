"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const tenantContext_1 = require("@/middleware/tenantContext");
const rbac_controller_1 = require("@/modules/rbac/rbac.controller");
const router = (0, express_1.Router)();
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// ─── Permissions ──────────────────────────────────────────────────────────────
/**
 * @route   GET /api/rbac/permissions
 * @desc    List all available permissions (grouped by resource)
 * @access  Requires role.read
 */
router.get('/permissions', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_READ), rbac_controller_1.RBACController.listPermissions);
// ─── Roles CRUD ───────────────────────────────────────────────────────────────
/**
 * @route   GET /api/rbac/roles
 * @desc    List all roles for the tenant
 * @access  Requires role.read
 */
router.get('/roles', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_READ), rbac_controller_1.RBACController.listRoles);
/**
 * @route   GET /api/rbac/roles/:id
 * @desc    Get role details including permissions and users
 * @access  Requires role.read
 */
router.get('/roles/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_READ), rbac_controller_1.RBACController.getRoleById);
/**
 * @route   POST /api/rbac/roles
 * @desc    Create a new role
 * @access  Requires role.create
 */
router.post('/roles', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_CREATE), rbac_controller_1.RBACController.createRole);
/**
 * @route   PUT /api/rbac/roles/:id
 * @desc    Update a role's name/description
 * @access  Requires role.update
 */
router.put('/roles/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_UPDATE), rbac_controller_1.RBACController.updateRole);
/**
 * @route   DELETE /api/rbac/roles/:id
 * @desc    Delete a role (system roles protected)
 * @access  Requires role.delete
 */
router.delete('/roles/:id', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_DELETE), rbac_controller_1.RBACController.deleteRole);
// ─── Role-Permission assignment ───────────────────────────────────────────────
/**
 * @route   PUT /api/rbac/roles/:id/permissions
 * @desc    Replace all permissions on a role (full replace)
 * @access  Requires role.update
 */
router.put('/roles/:id/permissions', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_UPDATE), rbac_controller_1.RBACController.setRolePermissions);
/**
 * @route   POST /api/rbac/roles/:id/permissions/add
 * @desc    Add permissions to a role (additive)
 * @access  Requires role.update
 */
router.post('/roles/:id/permissions/add', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_UPDATE), rbac_controller_1.RBACController.addPermissionsToRole);
/**
 * @route   DELETE /api/rbac/roles/:id/permissions/:permissionId
 * @desc    Remove a permission from a role
 * @access  Requires role.update
 */
router.delete('/roles/:id/permissions/:permissionId', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_UPDATE), rbac_controller_1.RBACController.removePermissionFromRole);
// ─── User-Role assignment ─────────────────────────────────────────────────────
/**
 * @route   GET /api/rbac/users/:userId/roles
 * @desc    Get all roles assigned to a user
 * @access  Requires role.read
 */
router.get('/users/:userId/roles', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_READ), rbac_controller_1.RBACController.getUserRoles);
/**
 * @route   GET /api/rbac/users/:userId/permissions
 * @desc    Get effective permissions for a user
 * @access  Requires role.read
 */
router.get('/users/:userId/permissions', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_READ), rbac_controller_1.RBACController.getUserPermissions);
/**
 * @route   POST /api/rbac/users/:userId/roles
 * @desc    Assign a role to a user
 * @access  Requires role.assign
 */
router.post('/users/:userId/roles', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_ASSIGN), rbac_controller_1.RBACController.assignRoleToUser);
/**
 * @route   DELETE /api/rbac/users/:userId/roles/:roleId
 * @desc    Remove a role from a user
 * @access  Requires role.assign
 */
router.delete('/users/:userId/roles/:roleId', (0, permission_1.requirePermission)(permissions_1.Permissions.ROLE_ASSIGN), rbac_controller_1.RBACController.removeRoleFromUser);
exports.default = router;
//# sourceMappingURL=rbac.js.map