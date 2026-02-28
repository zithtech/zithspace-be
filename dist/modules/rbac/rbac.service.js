"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_DEFAULT_PERMISSIONS = exports.ADMIN_DEFAULT_PERMISSIONS = exports.RBACService = void 0;
const database_1 = require("@/config/database");
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
class RBACService {
    // ─── Public API ────────────────────────────────────────────────────────────
    /**
     * Returns the full permission set for a user as a Set<string>.
     * Uses cache; loads from DB on miss.
     */
    static async getUserPermissions(userId, tenantId, legacyRole) {
        // Super admin shortcut — skip cache and DB
        if (legacyRole === 'super_admin') {
            return RBACService.getSuperAdminPermissions();
        }
        const key = `${tenantId}:${userId}`;
        const cached = RBACService.cache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.permissions;
        }
        const permissions = await RBACService.loadFromDB(userId, tenantId, legacyRole);
        RBACService.setCache(key, permissions);
        return permissions;
    }
    /**
     * Returns true if the user has the given permission.
     */
    static async hasPermission(userId, tenantId, permission, legacyRole) {
        const perms = await RBACService.getUserPermissions(userId, tenantId, legacyRole);
        return perms.has(permission);
    }
    /**
     * Returns true if the user has ALL of the given permissions.
     */
    static async hasAllPermissions(userId, tenantId, permissions, legacyRole) {
        const perms = await RBACService.getUserPermissions(userId, tenantId, legacyRole);
        return permissions.every((p) => perms.has(p));
    }
    /**
     * Returns true if the user has ANY of the given permissions.
     */
    static async hasAnyPermission(userId, tenantId, permissions, legacyRole) {
        const perms = await RBACService.getUserPermissions(userId, tenantId, legacyRole);
        return permissions.some((p) => perms.has(p));
    }
    /**
     * Invalidates the cache for a specific user.
     * Call this whenever a user's roles are changed.
     */
    static invalidateUser(userId, tenantId) {
        RBACService.cache.delete(`${tenantId}:${userId}`);
    }
    /**
     * Invalidates the cache for ALL users that have a given role.
     * Call this whenever a role's permissions are changed.
     */
    static async invalidateRole(roleId) {
        const userRoles = await database_1.prisma.userRole.findMany({
            where: { roleId },
            select: { userId: true, tenantId: true },
        });
        for (const { userId, tenantId } of userRoles) {
            RBACService.invalidateUser(userId, tenantId);
        }
    }
    /**
     * Clears the entire cache. Use sparingly (e.g. permission list changes).
     */
    static clearCache() {
        RBACService.cache.clear();
    }
    // ─── Internal helpers ──────────────────────────────────────────────────────
    static async loadFromDB(userId, tenantId, legacyRole) {
        const permissions = new Set();
        // Load from the new RBAC tables
        const userRoles = await database_1.prisma.userRole.findMany({
            where: {
                userId,
                tenantId,
                role: { isActive: true },
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } },
                ],
            },
            include: {
                role: {
                    include: {
                        rolePermissions: {
                            include: { permission: true },
                        },
                    },
                },
            },
        });
        for (const ur of userRoles) {
            for (const rp of ur.role.rolePermissions) {
                permissions.add(rp.permission.name);
            }
        }
        // Fallback: if the user has no roles yet (pre-migration), apply legacy defaults
        if (permissions.size === 0 && legacyRole) {
            const legacyPerms = RBACService.getLegacyPermissions(legacyRole);
            for (const p of legacyPerms)
                permissions.add(p);
        }
        return permissions;
    }
    static async getSuperAdminPermissions() {
        // Fetch all permission names from DB (or return wildcard shorthand)
        const all = await database_1.prisma.permission.findMany({ select: { name: true } });
        return new Set(all.map((p) => p.name));
    }
    static setCache(key, permissions) {
        RBACService.cache.set(key, {
            permissions,
            expiresAt: Date.now() + RBACService.CACHE_TTL,
        });
    }
    /**
     * Legacy fallback permissions for users not yet migrated to UserRole table.
     * Mirrors the seed script defaults.
     */
    static getLegacyPermissions(role) {
        switch (role) {
            case 'admin':
                return exports.ADMIN_DEFAULT_PERMISSIONS;
            case 'user':
                return exports.USER_DEFAULT_PERMISSIONS;
            default:
                return [];
        }
    }
}
exports.RBACService = RBACService;
RBACService.cache = new Map();
RBACService.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// ─── Default permission sets (mirrors seed-rbac.ts) ──────────────────────────
exports.ADMIN_DEFAULT_PERMISSIONS = [
    'user.create', 'user.read', 'user.update', 'user.delete', 'user.manage',
    'project.create', 'project.read', 'project.update', 'project.delete', 'project.manage',
    'ticket.create', 'ticket.read', 'ticket.update', 'ticket.delete',
    'ticket.assign', 'ticket.archive', 'ticket.manage',
    'attendance.create', 'attendance.read', 'attendance.update', 'attendance.manage',
    'leave.create', 'leave.read', 'leave.update', 'leave.delete',
    'leave.approve', 'leave.manage',
    'shift.create', 'shift.read', 'shift.update', 'shift.delete', 'shift.manage',
    'invoice.create', 'invoice.read', 'invoice.update', 'invoice.delete', 'invoice.manage',
    'transaction.create', 'transaction.read', 'transaction.update', 'transaction.manage',
    'client.create', 'client.read', 'client.update', 'client.delete', 'client.manage',
    'settings.read', 'settings.update',
    'role.read', 'role.assign',
    'report.read',
    'reimbursement.create', 'reimbursement.read', 'reimbursement.update',
    'reimbursement.approve', 'reimbursement.manage',
    'salary.read',
    'document.create', 'document.read', 'document.update', 'document.delete', 'document.manage',
    'onboarding.create', 'onboarding.read', 'onboarding.update', 'onboarding.manage',
    'timesheet.create', 'timesheet.read', 'timesheet.update', 'timesheet.approve', 'timesheet.manage',
    'org.read', 'org.manage',
    'daily_update.create', 'daily_update.read', 'daily_update.manage',
];
exports.USER_DEFAULT_PERMISSIONS = [
    'user.read',
    'project.read',
    'ticket.create', 'ticket.read', 'ticket.update',
    'attendance.read', 'attendance.update',
    'leave.create', 'leave.read', 'leave.update',
    'invoice.read',
    'settings.read',
    'report.read',
    'transaction.read',
    'reimbursement.create', 'reimbursement.read',
    'document.create', 'document.read', 'document.update',
    'onboarding.read',
    'timesheet.create', 'timesheet.read', 'timesheet.update',
    'org.read',
    'daily_update.create', 'daily_update.read',
];
//# sourceMappingURL=rbac.service.js.map