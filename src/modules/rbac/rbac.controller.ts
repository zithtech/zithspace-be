import { Response } from 'express';
import { isResourceAvailable } from '@/modules/entitlements/permission-features';
import { featureResolverService } from '@/modules/subscriptions';
import { productFromRequest } from '@/config/brand';
import { prisma } from '@/config/database';
import { AuthRequest, ApiResponse } from '@/types';
import { RBACService } from './rbac.service';
import { PERMISSIONS_BY_RESOURCE } from '@/types/permissions';
import {
  recordTransaction,
  diffShallow,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from "@/utils/transactionHistory";

/**
 * Reject permission ids the tenant's plan does not include.
 *
 * Hiding them in the role editor is presentation; this is the boundary. Without
 * it a crafted request could attach Payroll to a Testiez role — inert today,
 * because the API gate refuses those routes regardless, but it leaves a role
 * claiming authority it does not have, and it becomes real the moment a gate is
 * relaxed.
 *
 * Returns the offending resources, or null when everything is allowed.
 * Unmanaged tenants (no features) allow everything, as everywhere else.
 */
async function rejectUnentitledPermissions(
  req: AuthRequest,
  permissionIds: string[],
): Promise<string[] | null> {
  if (!permissionIds.length) return null;

  let granted: string[] = [];
  try {
    const tenantId = req.tenantId ?? req.user?.tenantId;
    if (!tenantId) return null;
    const product = productFromRequest(req);
    granted = await featureResolverService.getTenantFeatures(
      tenantId,
      product ? product.toUpperCase() : undefined,
    );
  } catch (err) {
    // Same rule as the gate: never block on a control-plane fault.
    console.error('[rbac] could not resolve features, allowing permission write:', err);
    return null;
  }

  if (granted.length === 0) return null;

  const rows = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { resource: true },
  });

  const bad = [...new Set(rows.map((r) => r.resource))].filter(
    (resource) => !isResourceAvailable(resource, granted),
  );

  return bad.length ? bad : null;
}

export class RBACController {
  // ─── Permissions ─────────────────────────────────────────────────────────────

  /**
   * GET /api/rbac/permissions
   * List all available permissions, grouped by resource.
   */
  static async listPermissions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const permissions = await prisma.permission.findMany({
        orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      });

      // Hide permissions the tenant's plan does not include.
      //
      // The catalogue is global — every tenant sees every permission — which is
      // fine with one product and wrong with two: offering Payroll to a Testiez
      // tenant builds a role whose permissions the API will refuse anyway.
      //
      // Failure here degrades to showing everything rather than nothing. The
      // role editor is not a security boundary; the API is, and it enforces
      // entitlement independently.
      let granted: string[] = [];
      try {
        const tenantId = req.tenantId ?? req.user?.tenantId;
        if (tenantId) {
          const product = productFromRequest(req);
          granted = await featureResolverService.getTenantFeatures(
            tenantId,
            product ? product.toUpperCase() : undefined,
          );
        }
      } catch (err) {
        console.error('[rbac] could not resolve features, showing all permissions:', err);
        granted = [];
      }

      const visible = permissions.filter((p) => isResourceAvailable(p.resource, granted));

      // Group by resource
      const grouped: Record<string, typeof permissions> = {};
      for (const perm of visible) {
        if (!grouped[perm.resource]) grouped[perm.resource] = [];
        grouped[perm.resource].push(perm);
      }

      res.status(200).json({
        success: true,
        data: { permissions: visible, grouped },
      } as ApiResponse);
    } catch (error) {
      console.error('listPermissions error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch permissions' } as ApiResponse);
    }
  }

  // ─── Roles ────────────────────────────────────────────────────────────────────

  /**
   * GET /api/rbac/roles
   * List all roles for the tenant.
   */
  static async listRoles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user!.tenantId;

      const roles = await prisma.role.findMany({
        where: { tenantId },
        include: {
          _count: {
            select: { rolePermissions: true, userRoles: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      res.status(200).json({ success: true, data: roles } as ApiResponse);
    } catch (error) {
      console.error('listRoles error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch roles' } as ApiResponse);
    }
  }

  /**
   * GET /api/rbac/roles/:id
   * Get a role with its permissions and assigned users.
   */
  static async getRoleById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      const role = await prisma.role.findFirst({
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
        res.status(404).json({ success: false, error: 'Role not found' } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: role } as ApiResponse);
    } catch (error) {
      console.error('getRoleById error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch role' } as ApiResponse);
    }
  }

  /**
   * POST /api/rbac/roles
   * Create a new role.
   */
  static async createRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user!.tenantId;
      const { name, description, permissionIds } = req.body as {
        name: string;
        description?: string;
        permissionIds?: string[];
      };

      if (Array.isArray(permissionIds) && permissionIds.length) {
        const unentitled = await rejectUnentitledPermissions(req, permissionIds);
        if (unentitled) {
          res.status(403).json({
            success: false,
            error: `These permissions are not included in your plan: ${unentitled.join(', ')}`,
            code: 'ENTITLEMENT_REQUIRED',
          } as ApiResponse);
          return;
        }
      }

      if (!name?.trim()) {
        res.status(400).json({ success: false, error: 'Role name is required' } as ApiResponse);
        return;
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      // Check slug uniqueness
      const existing = await prisma.role.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (existing) {
        res.status(409).json({
          success: false,
          error: `A role with the name "${name}" already exists`,
        } as ApiResponse);
        return;
      }

      const role = await prisma.role.create({
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

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.ROLE_AND_PERMISSIONS,
        page: Page.ROLE_LIST,
        action: Action.CREATE,
        actionLabel: `Role created: ${role.name}`,
        entityType: EntityType.ROLE,
        entityId: role.id,
        entityLabel: role.name,
        afterData: {
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          permissionIds: permissionIds || [],
        },
        statusCode: 201,
      });

      res.status(201).json({ success: true, data: role, message: 'Role created successfully' } as ApiResponse);
    } catch (error) {
      console.error('createRole error:', error);
      res.status(500).json({ success: false, error: 'Failed to create role' } as ApiResponse);
    }
  }

  /**
   * PUT /api/rbac/roles/:id
   * Update a role's name and description.
   */
  static async updateRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const { name, description } = req.body as { name?: string; description?: string };

      const role = await prisma.role.findFirst({ where: { id, tenantId } });
      if (!role) {
        res.status(404).json({ success: false, error: 'Role not found' } as ApiResponse);
        return;
      }

      const updated = await prisma.role.update({
        where: { id },
        data: {
          ...(name ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });

      const { changedFields, before, after } = diffShallow(
        { name: role.name, description: role.description },
        { name: updated.name, description: updated.description }
      );

      if (changedFields.length > 0) {
        recordTransaction({
          req,
          section: Section.ADMIN,
          module: Module.ROLE_AND_PERMISSIONS,
          page: Page.ROLE_LIST,
          action: Action.UPDATE,
          actionLabel: `Role updated: ${updated.name} (${changedFields.join(", ")})`,
          entityType: EntityType.ROLE,
          entityId: id,
          entityLabel: updated.name,
          beforeData: before,
          afterData: after,
          changedFields,
          statusCode: 200,
        });
      }

      res.status(200).json({ success: true, data: updated, message: 'Role updated' } as ApiResponse);
    } catch (error) {
      console.error('updateRole error:', error);
      res.status(500).json({ success: false, error: 'Failed to update role' } as ApiResponse);
    }
  }

  /**
   * DELETE /api/rbac/roles/:id
   * Delete a non-system role.
   */
  static async deleteRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      const role = await prisma.role.findFirst({ where: { id, tenantId } });
      if (!role) {
        res.status(404).json({ success: false, error: 'Role not found' } as ApiResponse);
        return;
      }
      if (role.isSystem) {
        res.status(403).json({ success: false, error: 'System roles cannot be deleted' } as ApiResponse);
        return;
      }

      // Invalidate cache for all users with this role before deleting
      await RBACService.invalidateRole(id);

      await prisma.role.delete({ where: { id } });

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.ROLE_AND_PERMISSIONS,
        page: Page.ROLE_LIST,
        action: Action.DELETE,
        actionLabel: `Role deleted: ${role.name}`,
        entityType: EntityType.ROLE,
        entityId: id,
        entityLabel: role.name,
        beforeData: {
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
        },
        statusCode: 200,
      });

      res.status(200).json({ success: true, message: 'Role deleted' } as ApiResponse);
    } catch (error) {
      console.error('deleteRole error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete role' } as ApiResponse);
    }
  }

  // ─── Permission assignment ────────────────────────────────────────────────────

  /**
   * POST /api/rbac/roles/:id/permissions
   * Replace all permissions on a role (full replace).
   * Body: { permissionIds: string[] }
   */
  static async setRolePermissions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const { permissionIds } = req.body as { permissionIds: string[] };

      const role = await prisma.role.findFirst({ where: { id, tenantId } });
      if (!role) {
        res.status(404).json({ success: false, error: 'Role not found' } as ApiResponse);
        return;
      }

      if (!Array.isArray(permissionIds)) {
        res.status(400).json({ success: false, error: 'permissionIds must be an array' } as ApiResponse);
        return;
      }

      const unentitled = await rejectUnentitledPermissions(req, permissionIds);
      if (unentitled) {
        res.status(403).json({
          success: false,
          error: `These permissions are not included in your plan: ${unentitled.join(', ')}`,
          code: 'ENTITLEMENT_REQUIRED',
        } as ApiResponse);
        return;
      }

      const oldPermissions = await prisma.rolePermission.findMany({
        where: { roleId: id },
        select: { permissionId: true },
      });
      const oldIds = oldPermissions.map((p) => p.permissionId);

      // Replace all permissions in a transaction
      await prisma.$transaction([
        prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        }),
      ]);

      // Invalidate cache for all users with this role
      await RBACService.invalidateRole(id);

      const updated = await prisma.role.findFirst({
        where: { id },
        include: { rolePermissions: { include: { permission: true } } },
      });

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.ROLE_AND_PERMISSIONS,
        page: Page.ROLE_LIST,
        action: Action.UPDATE,
        actionLabel: `Permissions updated for role ${role.name}`,
        entityType: EntityType.ROLE_PERMISSION,
        entityId: id,
        entityLabel: role.name,
        beforeData: { permissionIds: oldIds },
        afterData: { permissionIds },
        changedFields: ["permissionIds"],
        statusCode: 200,
      });

      res.status(200).json({ success: true, data: updated, message: 'Permissions updated' } as ApiResponse);
    } catch (error) {
      console.error('setRolePermissions error:', error);
      res.status(500).json({ success: false, error: 'Failed to update permissions' } as ApiResponse);
    }
  }

  /**
   * POST /api/rbac/roles/:id/permissions/add
   * Add specific permissions to a role (additive).
   */
  static async addPermissionsToRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const { permissionIds } = req.body as { permissionIds: string[] };

      const role = await prisma.role.findFirst({ where: { id, tenantId } });
      if (!role) {
        res.status(404).json({ success: false, error: 'Role not found' } as ApiResponse);
        return;
      }

      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        skipDuplicates: true,
      });

      await RBACService.invalidateRole(id);

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.ROLE_AND_PERMISSIONS,
        page: Page.ROLE_LIST,
        action: Action.UPDATE,
        actionLabel: `Added ${permissionIds.length} permission(s) to role ${role.name}`,
        entityType: EntityType.ROLE_PERMISSION,
        entityId: id,
        entityLabel: role.name,
        afterData: { addedPermissionIds: permissionIds },
        statusCode: 200,
      });

      res.status(200).json({ success: true, message: `Added ${permissionIds.length} permission(s)` } as ApiResponse);
    } catch (error) {
      console.error('addPermissionsToRole error:', error);
      res.status(500).json({ success: false, error: 'Failed to add permissions' } as ApiResponse);
    }
  }

  /**
   * DELETE /api/rbac/roles/:id/permissions/:permissionId
   * Remove a single permission from a role.
   */
  static async removePermissionFromRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id, permissionId } = req.params;
      const tenantId = req.user!.tenantId;

      const role = await prisma.role.findFirst({ where: { id, tenantId } });
      if (!role) {
        res.status(404).json({ success: false, error: 'Role not found' } as ApiResponse);
        return;
      }

      await prisma.rolePermission.delete({
        where: { roleId_permissionId: { roleId: id, permissionId } },
      });

      await RBACService.invalidateRole(id);

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.ROLE_AND_PERMISSIONS,
        page: Page.ROLE_LIST,
        action: Action.DELETE,
        actionLabel: `Removed permission from role ${role.name}`,
        entityType: EntityType.ROLE_PERMISSION,
        entityId: id,
        entityLabel: role.name,
        beforeData: { removedPermissionId: permissionId },
        statusCode: 200,
      });

      res.status(200).json({ success: true, message: 'Permission removed' } as ApiResponse);
    } catch (error) {
      console.error('removePermissionFromRole error:', error);
      res.status(500).json({ success: false, error: 'Failed to remove permission' } as ApiResponse);
    }
  }

  // ─── User-Role assignment ─────────────────────────────────────────────────────

  /**
   * GET /api/rbac/users/:userId/roles
   * Get all roles assigned to a user.
   */
  static async getUserRoles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const tenantId = req.user!.tenantId;

      const userRoles = await prisma.userRole.findMany({
        where: { userId, tenantId },
        include: { role: { include: { _count: { select: { rolePermissions: true } } } } },
      });

      res.status(200).json({ success: true, data: userRoles } as ApiResponse);
    } catch (error) {
      console.error('getUserRoles error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch user roles' } as ApiResponse);
    }
  }

  /**
   * GET /api/rbac/users/:userId/permissions
   * Get effective permissions for a user.
   */
  static async getUserPermissions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const tenantId = req.user!.tenantId;

      // Load the user to get legacy role for super_admin shortcut
      const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { role: true } });
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' } as ApiResponse);
        return;
      }

      const permSet = await RBACService.getUserPermissions(userId, tenantId, user.role);

      res.status(200).json({
        success: true,
        data: { permissions: Array.from(permSet) },
      } as ApiResponse);
    } catch (error) {
      console.error('getUserPermissions error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch permissions' } as ApiResponse);
    }
  }

  /**
   * POST /api/rbac/users/:userId/roles
   * Assign a role to a user.
   * Body: { roleId: string, expiresAt?: string }
   */
  static async assignRoleToUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const tenantId = req.user!.tenantId;
      const { roleId, expiresAt } = req.body as { roleId: string; expiresAt?: string };

      if (!roleId) {
        res.status(400).json({ success: false, error: 'roleId is required' } as ApiResponse);
        return;
      }

      // Verify role belongs to tenant
      const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
      if (!role) {
        res.status(404).json({ success: false, error: 'Role not found' } as ApiResponse);
        return;
      }

      // Verify user belongs to tenant
      const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' } as ApiResponse);
        return;
      }

      await prisma.$transaction([
        prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId } },
          create: {
            userId,
            roleId,
            tenantId,
            assignedById: req.user!.id,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
          update: {
            assignedById: req.user!.id,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
        }),
        // Sync legacy role string
        prisma.user.update({
          where: { id: userId },
          data: { role: role.slug }
        })
      ]);

      RBACService.invalidateUser(userId, tenantId);

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.ROLE_AND_PERMISSIONS,
        page: Page.ROLE_LIST,
        action: Action.UPDATE,
        actionLabel: `Assigned role "${role.name}" to user ${user?.name || userId}`,
        entityType: EntityType.USER_ROLE,
        entityId: roleId,
        entityLabel: role.name,
        parentEntityType: EntityType.USER,
        parentEntityId: userId,
        afterData: { roleName: role.name, roleSlug: role.slug, userId, userName: user?.name },
        statusCode: 200,
      });

      res.status(200).json({ success: true, message: `Role "${role.name}" assigned to user` } as ApiResponse);
    } catch (error) {
      console.error('assignRoleToUser error:', error);
      res.status(500).json({ success: false, error: 'Failed to assign role' } as ApiResponse);
    }
  }

  /**
   * DELETE /api/rbac/users/:userId/roles/:roleId
   * Remove a role from a user.
   */
  static async removeRoleFromUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { userId, roleId } = req.params;
      const tenantId = req.user!.tenantId;

      const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
      if (!role) {
        res.status(404).json({ success: false, error: 'Role not found' } as ApiResponse);
        return;
      }

      const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });

      await prisma.userRole.delete({
        where: { userId_roleId: { userId, roleId } },
      });

      // Sync legacy role: set to the most recently assigned remaining role, or fallback to 'user'
      const latestRole = await prisma.userRole.findFirst({
        where: { userId, tenantId },
        orderBy: { assignedAt: 'desc' },
        include: { role: true }
      });

      await prisma.user.update({
        where: { id: userId },
        data: { role: latestRole?.role.slug || 'user' }
      });

      RBACService.invalidateUser(userId, tenantId);

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.ROLE_AND_PERMISSIONS,
        page: Page.ROLE_LIST,
        action: Action.DELETE,
        actionLabel: `Removed role "${role.name}" from user ${user?.name || userId}`,
        entityType: EntityType.USER_ROLE,
        entityId: roleId,
        entityLabel: role.name,
        parentEntityType: EntityType.USER,
        parentEntityId: userId,
        beforeData: { roleName: role.name, roleSlug: role.slug, userId, userName: user?.name },
        statusCode: 200,
      });

      res.status(200).json({ success: true, message: 'Role removed from user' } as ApiResponse);
    } catch (error) {
      console.error('removeRoleFromUser error:', error);
      res.status(500).json({ success: false, error: 'Failed to remove role' } as ApiResponse);
    }
  }
}
