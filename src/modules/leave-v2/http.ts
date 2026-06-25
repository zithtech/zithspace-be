// src/modules/leave-v2/http.ts
// Small HTTP helpers shared by leave-v2 controllers so each handler stays thin.

import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';
import { Actor, LeaveV2Error } from './types';

/** Pull the acting principal off an authenticated request. */
export function actorOf(req: AuthRequest): Actor {
  // tenantId is set by resolveTenant; user by authenticateToken.
  const u = req.user as any;
  return {
    tenantId: req.tenantId as string,
    userId: u.id as string,
    employeeId: (u.employeeId as string) || undefined,
  };
}

type Handler = (req: AuthRequest, res: Response) => Promise<unknown>;

/**
 * Wrap an async controller: translate thrown LeaveV2Error / ZodError into the
 * platform's `{ success, error, code }` envelope; everything else → 500.
 */
export function handle(fn: Handler) {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof LeaveV2Error) {
        res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
        return;
      }
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
      }
      console.error('[leave-v2] unhandled error:', err);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}
