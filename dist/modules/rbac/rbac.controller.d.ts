import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class RBACController {
    /**
     * GET /api/rbac/permissions
     * List all available permissions, grouped by resource.
     */
    static listPermissions(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/rbac/roles
     * List all roles for the tenant.
     */
    static listRoles(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/rbac/roles/:id
     * Get a role with its permissions and assigned users.
     */
    static getRoleById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/rbac/roles
     * Create a new role.
     */
    static createRole(req: AuthRequest, res: Response): Promise<void>;
    /**
     * PUT /api/rbac/roles/:id
     * Update a role's name and description.
     */
    static updateRole(req: AuthRequest, res: Response): Promise<void>;
    /**
     * DELETE /api/rbac/roles/:id
     * Delete a non-system role.
     */
    static deleteRole(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/rbac/roles/:id/permissions
     * Replace all permissions on a role (full replace).
     * Body: { permissionIds: string[] }
     */
    static setRolePermissions(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/rbac/roles/:id/permissions/add
     * Add specific permissions to a role (additive).
     */
    static addPermissionsToRole(req: AuthRequest, res: Response): Promise<void>;
    /**
     * DELETE /api/rbac/roles/:id/permissions/:permissionId
     * Remove a single permission from a role.
     */
    static removePermissionFromRole(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/rbac/users/:userId/roles
     * Get all roles assigned to a user.
     */
    static getUserRoles(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/rbac/users/:userId/permissions
     * Get effective permissions for a user.
     */
    static getUserPermissions(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/rbac/users/:userId/roles
     * Assign a role to a user.
     * Body: { roleId: string, expiresAt?: string }
     */
    static assignRoleToUser(req: AuthRequest, res: Response): Promise<void>;
    /**
     * DELETE /api/rbac/users/:userId/roles/:roleId
     * Remove a role from a user.
     */
    static removeRoleFromUser(req: AuthRequest, res: Response): Promise<void>;
}
