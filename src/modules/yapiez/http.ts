// src/modules/yapiez/http.ts
// Small HTTP helpers shared by Yapiez controllers so each handler stays thin.
// Mirrors the company-details / opening-management conventions.

import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';
import { Actor, YapiezError } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * `router.param` guard for uuid route params — turns a malformed id into the
 * 400 it always was instead of a Postgres "invalid input syntax" 500.
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
  return { tenantId: (req as any).tenantId ?? u?.tenantId, userId: u?.id as string };
}

type Handler = (req: AuthRequest, res: Response) => Promise<unknown>;

/**
 * Wrap an async controller: translate thrown YapiezError / ZodError into the
 * platform's `{ success, error, code }` envelope; everything else → 500.
 */
export function handle(fn: Handler) {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof YapiezError) {
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
      console.error('[yapiez] unhandled error:', err);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

/** Paged list envelope — matches what the QA Space pages already consume. */
export function okList(
  res: Response,
  data: unknown[],
  meta: { total: number; page: number; pageSize: number }
): void {
  res.status(200).json({
    success: true,
    data,
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
    totalPages: Math.max(1, Math.ceil(meta.total / Math.max(1, meta.pageSize))),
  });
}

/** Clamp user-supplied paging into something the database is happy to serve. */
export function paging(query: Record<string, any>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const raw = parseInt(String(query.pageSize ?? query.limit ?? '20'), 10) || 20;
  const pageSize = Math.min(200, Math.max(1, raw));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
