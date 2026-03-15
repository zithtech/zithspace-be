"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAnyPermission = exports.requireAllPermissions = exports.requirePermission = void 0;
const rbac_service_1 = require("@/modules/rbac/rbac.service");
const database_1 = require("@/config/database");
// ─── Middleware factories ──────────────────────────────────────────────────────
/**
 * Require a single permission.
 *
 * Usage:
 *   router.post('/members', requirePermission('user.create'), Controller.action)
 */
const requirePermission = (permission) => {
    return async (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
            return;
        }
        const { id: userId, tenantId, role } = req.user;
        // Super admin bypasses all checks
        if (role === 'super_admin') {
            next();
            return;
        }
        const allowed = await rbac_service_1.RBACService.hasPermission(userId, tenantId, permission, role);
        if (!allowed) {
            void logDenial(req, permission);
            res.status(403).json({
                success: false,
                error: `Access denied. Missing permission: ${permission}`,
                code: 'INSUFFICIENT_PERMISSIONS',
                required: permission,
            });
            return;
        }
        next();
    };
};
exports.requirePermission = requirePermission;
/**
 * Require ALL of the listed permissions.
 *
 * Usage:
 *   router.put('/settings', requireAllPermissions('settings.read', 'settings.update'), Controller.action)
 */
const requireAllPermissions = (...permissions) => {
    return async (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
            return;
        }
        const { id: userId, tenantId, role } = req.user;
        if (role === 'super_admin') {
            next();
            return;
        }
        const allowed = await rbac_service_1.RBACService.hasAllPermissions(userId, tenantId, permissions, role);
        if (!allowed) {
            const perms = await rbac_service_1.RBACService.getUserPermissions(userId, tenantId, role);
            const missing = permissions.filter((p) => !perms.has(p));
            void logDenial(req, missing[0]);
            res.status(403).json({
                success: false,
                error: 'Access denied. Missing required permissions.',
                code: 'INSUFFICIENT_PERMISSIONS',
                missing,
            });
            return;
        }
        next();
    };
};
exports.requireAllPermissions = requireAllPermissions;
/**
 * Require ANY ONE of the listed permissions.
 *
 * Usage:
 *   router.get('/invoices', requireAnyPermission('invoice.read', 'invoice.manage'), Controller.action)
 */
const requireAnyPermission = (...permissions) => {
    return async (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
            return;
        }
        const { id: userId, tenantId, role } = req.user;
        if (role === 'super_admin') {
            next();
            return;
        }
        const allowed = await rbac_service_1.RBACService.hasAnyPermission(userId, tenantId, permissions, role);
        if (!allowed) {
            void logDenial(req, permissions[0]);
            res.status(403).json({
                success: false,
                error: 'Access denied. Requires one of the listed permissions.',
                code: 'INSUFFICIENT_PERMISSIONS',
                requiredAny: permissions,
            });
            return;
        }
        next();
    };
};
exports.requireAnyPermission = requireAnyPermission;
// ─── Audit logging ────────────────────────────────────────────────────────────
async function logDenial(req, permission) {
    try {
        const resource = permission.split('.')[0] ?? permission;
        await database_1.prisma.authorizationLog.create({
            data: {
                tenantId: req.user?.tenantId ?? req.tenantId ?? 'unknown',
                userId: req.user?.id,
                permission,
                resource,
                result: 'denied',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                endpoint: `${req.method} ${req.originalUrl}`,
            },
        });
    }
    catch {
        // non-blocking — never let audit logging break a request
    }
}
//# sourceMappingURL=permission.js.map