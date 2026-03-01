import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/types';
/**
 * Require a single permission.
 *
 * Usage:
 *   router.post('/members', requirePermission('user.create'), Controller.action)
 */
export declare const requirePermission: (permission: string) => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Require ALL of the listed permissions.
 *
 * Usage:
 *   router.put('/settings', requireAllPermissions('settings.read', 'settings.update'), Controller.action)
 */
export declare const requireAllPermissions: (...permissions: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Require ANY ONE of the listed permissions.
 *
 * Usage:
 *   router.get('/invoices', requireAnyPermission('invoice.read', 'invoice.manage'), Controller.action)
 */
export declare const requireAnyPermission: (...permissions: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
