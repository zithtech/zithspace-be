// src/modules/performance-report/http.ts
// Small HTTP helpers shared by performance-report controllers so each handler
// stays thin. Mirrors src/modules/leave-v2/http.ts.

import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';
import { Actor, PerfReportError } from './types';

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
 * Wrap an async controller: translate thrown PerfReportError / ZodError into the
 * platform's `{ success, error, code }` envelope; everything else → 500.
 */
export function handle(fn: Handler) {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof PerfReportError) {
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
      console.error('[performance-report] unhandled error:', err);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}
