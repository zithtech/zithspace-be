import { Router } from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from '@/middleware/tenantContext';
import { RBACController } from '@/modules/rbac/rbac.controller';

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * @route   GET /api/rbac/permissions
 * @desc    List all available permissions (grouped by resource)
 * @access  Requires role.read
 */
router.get('/permissions', requirePermission(Permissions.ROLE_READ), RBACController.listPermissions);

// ─── Roles CRUD ───────────────────────────────────────────────────────────────

/**
 * @route   GET /api/rbac/roles
 * @desc    List all roles for the tenant
 * @access  Requires role.read
 */
router.get('/roles', requirePermission(Permissions.ROLE_READ), RBACController.listRoles);

/**
 * @route   GET /api/rbac/roles/:id
 * @desc    Get role details including permissions and users
 * @access  Requires role.read
 */
router.get('/roles/:id', requirePermission(Permissions.ROLE_READ), RBACController.getRoleById);

/**
 * @route   POST /api/rbac/roles
 * @desc    Create a new role
 * @access  Requires role.create
 */
router.post('/roles', requirePermission(Permissions.ROLE_CREATE), RBACController.createRole);

/**
 * @route   PUT /api/rbac/roles/:id
 * @desc    Update a role's name/description
 * @access  Requires role.update
 */
router.put('/roles/:id', requirePermission(Permissions.ROLE_UPDATE), RBACController.updateRole);

/**
 * @route   DELETE /api/rbac/roles/:id
 * @desc    Delete a role (system roles protected)
 * @access  Requires role.delete
 */
router.delete('/roles/:id', requirePermission(Permissions.ROLE_DELETE), RBACController.deleteRole);

// ─── Role-Permission assignment ───────────────────────────────────────────────

/**
 * @route   PUT /api/rbac/roles/:id/permissions
 * @desc    Replace all permissions on a role (full replace)
 * @access  Requires role.update
 */
router.put('/roles/:id/permissions', requirePermission(Permissions.ROLE_UPDATE), RBACController.setRolePermissions);

/**
 * @route   POST /api/rbac/roles/:id/permissions/add
 * @desc    Add permissions to a role (additive)
 * @access  Requires role.update
 */
router.post('/roles/:id/permissions/add', requirePermission(Permissions.ROLE_UPDATE), RBACController.addPermissionsToRole);

/**
 * @route   DELETE /api/rbac/roles/:id/permissions/:permissionId
 * @desc    Remove a permission from a role
 * @access  Requires role.update
 */
router.delete('/roles/:id/permissions/:permissionId', requirePermission(Permissions.ROLE_UPDATE), RBACController.removePermissionFromRole);

// ─── User-Role assignment ─────────────────────────────────────────────────────

/**
 * @route   GET /api/rbac/users/:userId/roles
 * @desc    Get all roles assigned to a user
 * @access  Requires role.read
 */
router.get('/users/:userId/roles', requirePermission(Permissions.ROLE_READ), RBACController.getUserRoles);

/**
 * @route   GET /api/rbac/users/:userId/permissions
 * @desc    Get effective permissions for a user
 * @access  Requires role.read
 */
router.get('/users/:userId/permissions', requirePermission(Permissions.ROLE_READ), RBACController.getUserPermissions);

/**
 * @route   POST /api/rbac/users/:userId/roles
 * @desc    Assign a role to a user
 * @access  Requires role.assign
 */
router.post('/users/:userId/roles', requirePermission(Permissions.ROLE_ASSIGN), RBACController.assignRoleToUser);

/**
 * @route   DELETE /api/rbac/users/:userId/roles/:roleId
 * @desc    Remove a role from a user
 * @access  Requires role.assign
 */
router.delete('/users/:userId/roles/:roleId', requirePermission(Permissions.ROLE_ASSIGN), RBACController.removeRoleFromUser);

export default router;
