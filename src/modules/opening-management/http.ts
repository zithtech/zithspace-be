// src/modules/opening-management/http.ts
// Small HTTP helpers shared by opening-management controllers so each handler
// stays thin.

import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';
import { Actor, OpeningError } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `router.param` guard for uuid route params.
 *
 * Without it a path like `/api/v2/openings/not-a-uuid` reaches Postgres and
 * fails with `invalid input syntax for type uuid`, which surfaces as a 500. This
 * turns it into the 400 it always was.
 */
export function validateUuidParam(
  req: Request,
  res: Response,
  next: NextFunction,
  value: string,
  name: string
): void {
  if (!UUID_RE.test(value)) {
    res.status(400).json({
      success: false,
      error: `Invalid ${name}: expected a uuid`,
      code: 'VALIDATION_ERROR',
    });
    return;
  }
  next();
}

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
 * Wrap an async controller: translate thrown OpeningError / ZodError into the
 * platform's `{ success, error, code }` envelope; everything else → 500.
 */
export function handle(fn: Handler) {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof OpeningError) {
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
      console.error('[opening-management] unhandled error:', err);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}
