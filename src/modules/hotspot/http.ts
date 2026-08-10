// src/modules/hotspot/http.ts
// Small HTTP helpers shared by hotspot controllers so each handler stays thin.

import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';
import { Actor, HotspotError } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `router.param` guard for uuid route params.
 *
 * Without it a path like `/api/v2/hotspot/circulation/not-a-uuid` reaches
 * Postgres and fails with `invalid input syntax for type uuid`, which surfaces
 * as a 500. This turns it into the 400 it always was.
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

/**
 * Pull the acting principal off an authenticated request.
 *
 * `canModerate` decides who may touch someone else's post. Circulation is a
 * company noticeboard: everyone posts, but only a principal who runs the
 * Hotspot can pin or remove another person's update. The flag is resolved once
 * per request by `resolveModeration` (see ./middleware/moderation.ts) — reading
 * it here keeps actorOf synchronous, matching the other v2 modules.
 */
export function actorOf(req: AuthRequest): Actor {
  // tenantId is set by resolveTenant; user by authenticateToken.
  const u = req.user as any;

  return {
    tenantId: req.tenantId as string,
    userId: u.id as string,
    employeeId: (u.employeeId as string) || undefined,
    canModerate: (req as any).hsCanModerate === true,
  };
}

type Handler = (req: AuthRequest, res: Response) => Promise<unknown>;

/**
 * Wrap an async controller: translate thrown HotspotError / ZodError into the
 * platform's `{ success, error, code }` envelope; everything else → 500.
 */
export function handle(fn: Handler) {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HotspotError) {
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
      console.error('[hotspot] unhandled error:', err);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}
