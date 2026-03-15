/**
 * RBACService — resolves a user's effective permission set.
 *
 * Permissions are loaded by joining:
 *   UserRole → Role → RolePermission → Permission
 *
 * Results are cached per (tenantId:userId) for CACHE_TTL ms.
 * Cache is invalidated explicitly whenever roles change.
 *
 * Special case: users with User.role === 'super_admin' bypass all checks —
 * their permission set is treated as "all permissions" without a DB query.
 */
export declare class RBACService {
    private static cache;
    private static readonly CACHE_TTL;
    /**
     * Returns the full permission set for a user as a Set<string>.
     * Uses cache; loads from DB on miss.
     */
    static getUserPermissions(userId: string, tenantId: string, legacyRole?: string): Promise<Set<string>>;
    /**
     * Returns true if the user has the given permission.
     */
    static hasPermission(userId: string, tenantId: string, permission: string, legacyRole?: string): Promise<boolean>;
    /**
     * Returns true if the user has ALL of the given permissions.
     */
    static hasAllPermissions(userId: string, tenantId: string, permissions: string[], legacyRole?: string): Promise<boolean>;
    /**
     * Returns true if the user has ANY of the given permissions.
     */
    static hasAnyPermission(userId: string, tenantId: string, permissions: string[], legacyRole?: string): Promise<boolean>;
    /**
     * Invalidates the cache for a specific user.
     * Call this whenever a user's roles are changed.
     */
    static invalidateUser(userId: string, tenantId: string): void;
    /**
     * Invalidates the cache for ALL users that have a given role.
     * Call this whenever a role's permissions are changed.
     */
    static invalidateRole(roleId: string): Promise<void>;
    /**
     * Clears the entire cache. Use sparingly (e.g. permission list changes).
     */
    static clearCache(): void;
    private static loadFromDB;
    private static getSuperAdminPermissions;
    private static setCache;
    /**
     * Legacy fallback permissions for users not yet migrated to UserRole table.
     * Mirrors the seed script defaults.
     */
    private static getLegacyPermissions;
}
export declare const ADMIN_DEFAULT_PERMISSIONS: string[];
export declare const USER_DEFAULT_PERMISSIONS: string[];
