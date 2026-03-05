"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RBACController = void 0;
const database_1 = require("@/config/database");
const rbac_service_1 = require("./rbac.service");
class RBACController {
    // ─── Permissions ─────────────────────────────────────────────────────────────
    /**
     * GET /api/rbac/permissions
     * List all available permissions, grouped by resource.
     */
    static async listPermissions(req, res) {
        try {
            const permissions = await database_1.prisma.permission.findMany({
                orderBy: [{ resource: 'asc' }, { action: 'asc' }],
            });
            // Group by resource
            const grouped = {};
            for (const perm of permissions) {
                if (!grouped[perm.resource])
                    grouped[perm.resource] = [];
                grouped[perm.resource].push(perm);
            }
            res.status(200).json({
                success: true,
                data: { permissions, grouped },
            });
        }
        catch (error) {
            console.error('listPermissions error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch permissions' });
        }
    }
    // ─── Roles ────────────────────────────────────────────────────────────────────
    /**
     * GET /api/rbac/roles
     * List all roles for the tenant.
     */
    static async listRoles(req, res) {
        try {
            const tenantId = req.user.tenantId;
            const roles = await database_1.prisma.role.findMany({
                where: { tenantId },
                include: {
                    _count: {
                        select: { rolePermissions: true, userRoles: true },
                    },
                },
                orderBy: { createdAt: 'asc' },
            });
            res.status(200).json({ success: true, data: roles });
        }
        catch (error) {
            console.error('listRoles error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch roles' });
        }
    }
    /**
     * GET /api/rbac/roles/:id
     * Get a role with its permissions and assigned users.
     */
    static async getRoleById(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.user.tenantId;
            const role = await database_1.prisma.role.findFirst({
                where: { id, tenantId },
                include: {
                    rolePermissions: {
                        include: { permission: true },
                        orderBy: { permission: { name: 'asc' } },
                    },
                    userRoles: {
                        include: {
                            user: { select: { id: true, name: true, workEmail: true, role: true } },
                        },
                    },
                },
            });
            if (!role) {
                res.status(404).json({ success: false, error: 'Role not found' });
                return;
            }
            res.status(200).json({ success: true, data: role });
        }
        catch (error) {
            console.error('getRoleById error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch role' });
        }
    }
    /**
     * POST /api/rbac/roles
     * Create a new role.
     */
    static async createRole(req, res) {
        try {
            const tenantId = req.user.tenantId;
            const { name, description, permissionIds } = req.body;
            if (!name?.trim()) {
                res.status(400).json({ success: false, error: 'Role name is required' });
                return;
            }
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            // Check slug uniqueness
            const existing = await database_1.prisma.role.findUnique({
                where: { tenantId_slug: { tenantId, slug } },
            });
            if (existing) {
                res.status(409).json({
                    success: false,
                    error: `A role with the name "${name}" already exists`,
                });
                return;
            }
            const role = await database_1.prisma.role.create({
                data: {
                    tenantId,
                    name: name.trim(),
                    slug,
                    description,
                    isSystem: false,
                    ...(permissionIds?.length
                        ? {
                            rolePermissions: {
                                create: permissionIds.map((permissionId) => ({ permissionId })),
                            },
                        }
                        : {}),
                },
                include: {
                    rolePermissions: { include: { permission: true } },
                    _count: { select: { rolePermissions: true, userRoles: true } },
                },
            });
            res.status(201).json({ success: true, data: role, message: 'Role created successfully' });
        }
        catch (error) {
            console.error('createRole error:', error);
            res.status(500).json({ success: false, error: 'Failed to create role' });
        }
    }
    /**
     * PUT /api/rbac/roles/:id
     * Update a role's name and description.
     */
    static async updateRole(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.user.tenantId;
            const { name, description } = req.body;
            const role = await database_1.prisma.role.findFirst({ where: { id, tenantId } });
            if (!role) {
                res.status(404).json({ success: false, error: 'Role not found' });
                return;
            }
            const updated = await database_1.prisma.role.update({
                where: { id },
                data: {
                    ...(name ? { name: name.trim() } : {}),
                    ...(description !== undefined ? { description } : {}),
                },
            });
            res.status(200).json({ success: true, data: updated, message: 'Role updated' });
        }
        catch (error) {
            console.error('updateRole error:', error);
            res.status(500).json({ success: false, error: 'Failed to update role' });
        }
    }
    /**
     * DELETE /api/rbac/roles/:id
     * Delete a non-system role.
     */
    static async deleteRole(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.user.tenantId;
            const role = await database_1.prisma.role.findFirst({ where: { id, tenantId } });
            if (!role) {
                res.status(404).json({ success: false, error: 'Role not found' });
                return;
            }
            if (role.isSystem) {
                res.status(403).json({ success: false, error: 'System roles cannot be deleted' });
                return;
            }
            // Invalidate cache for all users with this role before deleting
            await rbac_service_1.RBACService.invalidateRole(id);
            await database_1.prisma.role.delete({ where: { id } });
            res.status(200).json({ success: true, message: 'Role deleted' });
        }
        catch (error) {
            console.error('deleteRole error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete role' });
        }
    }
    // ─── Permission assignment ────────────────────────────────────────────────────
    /**
     * POST /api/rbac/roles/:id/permissions
     * Replace all permissions on a role (full replace).
     * Body: { permissionIds: string[] }
     */
    static async setRolePermissions(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.user.tenantId;
            const { permissionIds } = req.body;
            const role = await database_1.prisma.role.findFirst({ where: { id, tenantId } });
            if (!role) {
                res.status(404).json({ success: false, error: 'Role not found' });
                return;
            }
            if (!Array.isArray(permissionIds)) {
                res.status(400).json({ success: false, error: 'permissionIds must be an array' });
                return;
            }
            // Replace all permissions in a transaction
            await database_1.prisma.$transaction([
                database_1.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
                database_1.prisma.rolePermission.createMany({
                    data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
                    skipDuplicates: true,
                }),
            ]);
            // Invalidate cache for all users with this role
            await rbac_service_1.RBACService.invalidateRole(id);
            const updated = await database_1.prisma.role.findFirst({
                where: { id },
                include: { rolePermissions: { include: { permission: true } } },
            });
            res.status(200).json({ success: true, data: updated, message: 'Permissions updated' });
        }
        catch (error) {
            console.error('setRolePermissions error:', error);
            res.status(500).json({ success: false, error: 'Failed to update permissions' });
        }
    }
    /**
     * POST /api/rbac/roles/:id/permissions/add
     * Add specific permissions to a role (additive).
     */
    static async addPermissionsToRole(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.user.tenantId;
            const { permissionIds } = req.body;
            const role = await database_1.prisma.role.findFirst({ where: { id, tenantId } });
            if (!role) {
                res.status(404).json({ success: false, error: 'Role not found' });
                return;
            }
            await database_1.prisma.rolePermission.createMany({
                data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
                skipDuplicates: true,
            });
            await rbac_service_1.RBACService.invalidateRole(id);
            res.status(200).json({ success: true, message: `Added ${permissionIds.length} permission(s)` });
        }
        catch (error) {
            console.error('addPermissionsToRole error:', error);
            res.status(500).json({ success: false, error: 'Failed to add permissions' });
        }
    }
    /**
     * DELETE /api/rbac/roles/:id/permissions/:permissionId
     * Remove a single permission from a role.
     */
    static async removePermissionFromRole(req, res) {
        try {
            const { id, permissionId } = req.params;
            const tenantId = req.user.tenantId;
            const role = await database_1.prisma.role.findFirst({ where: { id, tenantId } });
            if (!role) {
                res.status(404).json({ success: false, error: 'Role not found' });
                return;
            }
            await database_1.prisma.rolePermission.delete({
                where: { roleId_permissionId: { roleId: id, permissionId } },
            });
            await rbac_service_1.RBACService.invalidateRole(id);
            res.status(200).json({ success: true, message: 'Permission removed' });
        }
        catch (error) {
            console.error('removePermissionFromRole error:', error);
            res.status(500).json({ success: false, error: 'Failed to remove permission' });
        }
    }
    // ─── User-Role assignment ─────────────────────────────────────────────────────
    /**
     * GET /api/rbac/users/:userId/roles
     * Get all roles assigned to a user.
     */
    static async getUserRoles(req, res) {
        try {
            const { userId } = req.params;
            const tenantId = req.user.tenantId;
            const userRoles = await database_1.prisma.userRole.findMany({
                where: { userId, tenantId },
                include: { role: { include: { _count: { select: { rolePermissions: true } } } } },
            });
            res.status(200).json({ success: true, data: userRoles });
        }
        catch (error) {
            console.error('getUserRoles error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch user roles' });
        }
    }
    /**
     * GET /api/rbac/users/:userId/permissions
     * Get effective permissions for a user.
     */
    static async getUserPermissions(req, res) {
        try {
            const { userId } = req.params;
            const tenantId = req.user.tenantId;
            // Load the user to get legacy role for super_admin shortcut
            const user = await database_1.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { role: true } });
            if (!user) {
                res.status(404).json({ success: false, error: 'User not found' });
                return;
            }
            const permSet = await rbac_service_1.RBACService.getUserPermissions(userId, tenantId, user.role);
            res.status(200).json({
                success: true,
                data: { permissions: Array.from(permSet) },
            });
        }
        catch (error) {
            console.error('getUserPermissions error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch permissions' });
        }
    }
    /**
     * POST /api/rbac/users/:userId/roles
     * Assign a role to a user.
     * Body: { roleId: string, expiresAt?: string }
     */
    static async assignRoleToUser(req, res) {
        try {
            const { userId } = req.params;
            const tenantId = req.user.tenantId;
            const { roleId, expiresAt } = req.body;
            if (!roleId) {
                res.status(400).json({ success: false, error: 'roleId is required' });
                return;
            }
            // Verify role belongs to tenant
            const role = await database_1.prisma.role.findFirst({ where: { id: roleId, tenantId } });
            if (!role) {
                res.status(404).json({ success: false, error: 'Role not found' });
                return;
            }
            // Verify user belongs to tenant
            const user = await database_1.prisma.user.findFirst({ where: { id: userId, tenantId } });
            if (!user) {
                res.status(404).json({ success: false, error: 'User not found' });
                return;
            }
            await database_1.prisma.userRole.upsert({
                where: { userId_roleId: { userId, roleId } },
                create: {
                    userId,
                    roleId,
                    tenantId,
                    assignedById: req.user.id,
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                },
                update: {
                    assignedById: req.user.id,
                    expiresAt: expiresAt ? new Date(expiresAt) : null,
                },
            });
            rbac_service_1.RBACService.invalidateUser(userId, tenantId);
            res.status(200).json({ success: true, message: `Role "${role.name}" assigned to user` });
        }
        catch (error) {
            console.error('assignRoleToUser error:', error);
            res.status(500).json({ success: false, error: 'Failed to assign role' });
        }
    }
    /**
     * DELETE /api/rbac/users/:userId/roles/:roleId
     * Remove a role from a user.
     */
    static async removeRoleFromUser(req, res) {
        try {
            const { userId, roleId } = req.params;
            const tenantId = req.user.tenantId;
            const role = await database_1.prisma.role.findFirst({ where: { id: roleId, tenantId } });
            if (!role) {
                res.status(404).json({ success: false, error: 'Role not found' });
                return;
            }
            await database_1.prisma.userRole.delete({
                where: { userId_roleId: { userId, roleId } },
            });
            rbac_service_1.RBACService.invalidateUser(userId, tenantId);
            res.status(200).json({ success: true, message: 'Role removed from user' });
        }
        catch (error) {
            console.error('removeRoleFromUser error:', error);
            res.status(500).json({ success: false, error: 'Failed to remove role' });
        }
    }
}
exports.RBACController = RBACController;
//# sourceMappingURL=rbac.controller.js.map