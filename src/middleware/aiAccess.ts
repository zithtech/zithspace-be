import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/types';
import pool from '@/config/dbpool';

/**
 * Gate AI-feature endpoints on the caller's per-user AI access toggle
 * (users.ai_enabled). Opt-out model: access is allowed unless the flag is
 * explicitly false, so a missing column / infra hiccup never blocks everyone.
 *
 * Apply AFTER authenticateToken (needs req.user) and the feature permission.
 */
export const requireAiAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
    return;
  }

  try {
    const result = await pool.query('SELECT ai_enabled FROM users WHERE id = $1 LIMIT 1', [req.user.id]);
    if (result.rows[0]?.ai_enabled === false) {
      res.status(403).json({
        success: false,
        error: 'AI access is disabled for your account. Contact your administrator.',
        code: 'AI_ACCESS_DISABLED',
      });
      return;
    }
    next();
  } catch (err) {
    // Fail open — an availability blip shouldn't take AI down for everyone.
    console.error('[requireAiAccess] check failed, allowing through:', err);
    next();
  }
};
