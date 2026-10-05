// src/modules/project-agreements/http.ts
//
// Thin HTTP helpers so each controller stays readable. Mirrors the qa-playbooks
// / company-details conventions, including the `{ success, data }` /
// `{ success, error, code }` envelope the rest of the app already consumes.

import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';

export class AgreementError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'AGREEMENT_ERROR'
  ) {
    super(message);
    this.name = 'AgreementError';
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
      if (err instanceof AgreementError) {
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
      // 23505 = unique_violation. The two unique indexes a user can actually
      // collide with are the template name and the document number, so say
      // which rather than returning a bare 500.
      const pgCode = (err as any)?.code;
      if (pgCode === '23505') {
        const constraint = String((err as any)?.constraint ?? '');
        const message = constraint.includes('number')
          ? 'That document number is already in use'
          : 'A template with that name already exists';
        res.status(409).json({ success: false, error: message, code: 'DUPLICATE' });
        return;
      }
      console.error('[project-agreements] unhandled error:', err);
      res
        .status(500)
        .json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  };
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}
