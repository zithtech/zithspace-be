// src/modules/pipeline/http.ts
import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';
import { Actor, PipelineError } from './types';

export function actorOf(req: AuthRequest): Actor {
  const u = req.user as any;
  return {
    tenantId: req.tenantId as string,
    userId: u.id as string,
  };
}

type Handler = (req: AuthRequest, res: Response) => Promise<unknown>;

export function handle(fn: Handler) {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof PipelineError) {
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
      console.error('[pipeline] unhandled error:', err);
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}
