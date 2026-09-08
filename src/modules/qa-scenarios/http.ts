// src/modules/qa-scenarios/http.ts
// Thin HTTP helpers so the controller stays readable. Mirrors the qa-playbooks
// / yapiez conventions, including the `{ success, error, code }` envelope the
// QA Space pages already consume.

import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';

export class ScenarioError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'SCENARIO_ERROR'
  ) {
    super(message);
    this.name = 'ScenarioError';
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

type Handler = (req: AuthRequest, res: Response) => Promise<unknown>;

export function handle(fn: Handler) {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ScenarioError) {
        res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
        return;
      }
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: err.issues[0]?.message || 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
      }
      // A duplicate flow name is a user mistake, not a server fault — the
      // unique index in migration 001 is what enforces it.
      if ((err as any)?.code === '23505') {
        res.status(409).json({
          success: false,
          error: 'A test scenario with that name already exists on this page',
          code: 'DUPLICATE_NAME',
        });
        return;
      }
      console.error('[qa-scenarios] unhandled error:', err);
      res
        .status(500)
        .json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}
