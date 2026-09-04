// src/modules/qa-playbooks/http.ts
// Thin HTTP helpers so each controller stays readable. Mirrors the yapiez /
// company-details conventions, including the `{ success, error, code }` envelope
// the QA Space pages already consume.

import { NextFunction, Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';

export class PlaybookError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'PLAYBOOK_ERROR'
  ) {
    super(message);
    this.name = 'PlaybookError';
  }
}

export interface Actor {
  tenantId: string;
  userId: string;
}

/** Pull the acting principal off an authenticated request. */
export function actorOf(req: AuthRequest): Actor {
  const u = req.user as any;
  return { tenantId: (req as any).tenantId ?? u?.tenantId, userId: u?.id as string };
}

/**
 * Platform authority — Testiez staff rather than a tenant's own admin.
 *
 * `role === 'super_admin'` is the platform check the rest of this codebase uses
 * (it short-circuits requireAnyPermission in middleware/permission.ts). It is
 * what separates "publish to every tenant" from "author for my own workspace",
 * so it deliberately does NOT fall back to a tenant-grantable permission: a
 * tenant admin who could grant themselves qa.manage must not be able to publish
 * into the shared library.
 */
export function isSuperAdmin(req: AuthRequest): boolean {
  return (req.user as any)?.role === 'super_admin';
}

/** Guard for the routes only Testiez staff may call. */
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!isSuperAdmin(req)) {
    res.status(403).json({
      success: false,
      error: 'This action is restricted to Testiez administrators',
      code: 'FORBIDDEN',
    });
    return;
  }
  next();
}

type Handler = (req: AuthRequest, res: Response) => Promise<unknown>;

export function handle(fn: Handler) {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof PlaybookError) {
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
      console.error('[qa-playbooks] unhandled error:', err);
      res
        .status(500)
        .json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

/** Comma-separated query filter → a clean list, or undefined when absent. */
export function listParam(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}
