import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/types';
import { RBACService } from '@/modules/rbac/rbac.service';
import { prisma } from '@/config/database';

// ─── Middleware factories ──────────────────────────────────────────────────────

/**
 * Require a single permission.
 *
 * Usage:
 *   router.post('/members', requirePermission('user.create'), Controller.action)
 */
export const requirePermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const allowed = await RBACService.hasPermission(userId, tenantId, permission, role);

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

/**
 * Require ALL of the listed permissions.
 *
 * Usage:
 *   router.put('/settings', requireAllPermissions('settings.read', 'settings.update'), Controller.action)
 */
export const requireAllPermissions = (...permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
      return;
    }

    const { id: userId, tenantId, role } = req.user;

    if (role === 'super_admin') { next(); return; }

    const allowed = await RBACService.hasAllPermissions(userId, tenantId, permissions, role);

    if (!allowed) {
      const perms = await RBACService.getUserPermissions(userId, tenantId, role);
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

/**
 * Require ANY ONE of the listed permissions.
 *
 * Usage:
 *   router.get('/invoices', requireAnyPermission('invoice.read', 'invoice.manage'), Controller.action)
 */
export const requireAnyPermission = (...permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
      return;
    }

    const { id: userId, tenantId, role } = req.user;

    if (role === 'super_admin') { next(); return; }

    const allowed = await RBACService.hasAnyPermission(userId, tenantId, permissions, role);

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

// ─── Audit logging ────────────────────────────────────────────────────────────

async function logDenial(req: AuthRequest, permission: string): Promise<void> {
  try {
    const resource = permission.split('.')[0] ?? permission;
    await prisma.authorizationLog.create({
      data: {
        tenantId:   req.user?.tenantId ?? req.tenantId ?? 'unknown',
        userId:     req.user?.id,
        permission,
        resource,
        result:     'denied',
        ipAddress:  req.ip,
        userAgent:  req.headers['user-agent'],
        endpoint:   `${req.method} ${req.originalUrl}`,
      },
    });
  } catch {
    // non-blocking — never let audit logging break a request
  }
}
