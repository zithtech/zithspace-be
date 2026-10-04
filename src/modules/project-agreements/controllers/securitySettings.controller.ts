import { Request, Response } from 'express';
import { agreementPool } from '../db/pool';
import {
  getTenantSecuritySettings,
  updateTenantSecuritySettings,
  verifyAndCreateUnlockSession,
  evaluateAgreementLockStatus,
  validateUnlockSession,
  verifyAndCreateTemplateUnlockSession,
  evaluateTemplateLockStatus,
  validateTemplateUnlockSession,
} from '../services/passwordProtection.service';

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req as any).tenantId;
    const client = { query: agreementPool.query.bind(agreementPool), tenantId };
    const settings = await getTenantSecuritySettings(client);
    res.json({ success: true, data: settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not load security settings' });
  }
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req as any).tenantId;
    const client = { query: agreementPool.query.bind(agreementPool), tenantId };
    const userId = (req as any).user?.id || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || '0.0.0.0';

    const settings = await updateTenantSecuritySettings(client, req.body, {
      actorId: userId,
      actorType: 'STAFF_USER',
      ipAddress,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Could not save security settings' });
  }
}

export async function unlockAgreement(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    res.status(400).json({ success: false, error: 'Password is required' });
    return;
  }

  try {
    const tenantId = (req as any).tenantId;
    const client = { query: agreementPool.query.bind(agreementPool), tenantId };
    const userId = (req as any).user?.id || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || '0.0.0.0';

    const result = await verifyAndCreateUnlockSession(client, id, password, {
      actorId: userId,
      actorType: 'STAFF_USER',
      ipAddress,
      userAgent: req.headers['user-agent'],
    });

    res.setHeader('X-Agreement-Unlock-Token', result.token);
    res.json({
      success: true,
      data: {
        unlockToken: result.token,
        expiresAt: result.expiresAt,
      },
    });
  } catch (err: any) {
    res.status(401).json({ success: false, code: 'INVALID_PASSWORD', error: err?.message || 'Invalid password' });
  }
}

export async function unlockTemplate(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    res.status(400).json({ success: false, error: 'Password is required' });
    return;
  }

  try {
    const tenantId = (req as any).tenantId;
    const client = { query: agreementPool.query.bind(agreementPool), tenantId };
    const userId = (req as any).user?.id || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || '0.0.0.0';

    const result = await verifyAndCreateTemplateUnlockSession(client, id, password, {
      actorId: userId,
      actorType: 'STAFF_USER',
      ipAddress,
      userAgent: req.headers['user-agent'],
    });

    res.setHeader('X-Agreement-Unlock-Token', result.token);
    res.json({
      success: true,
      data: {
        unlockToken: result.token,
        expiresAt: result.expiresAt,
      },
    });
  } catch (err: any) {
    res.status(401).json({ success: false, code: 'INVALID_PASSWORD', error: err?.message || 'Invalid password' });
  }
}

/** Express middleware to enforce unlock token verification on protected agreement endpoints */
export async function requireAgreementUnlockGuard(req: Request, res: Response, next: any): Promise<void> {
  const { id } = req.params;
  if (!id) {
    next();
    return;
  }

  try {
    const tenantId = (req as any).tenantId;
    const client = { query: agreementPool.query.bind(agreementPool), tenantId };
    const lockEval = await evaluateAgreementLockStatus(client, id);

    if (!lockEval.isLocked) {
      next();
      return;
    }

    const unlockToken = (req.headers['x-agreement-unlock-token'] as string) || (req.query.unlockToken as string);
    const isValid = await validateUnlockSession(client, id, unlockToken);

    if (isValid) {
      next();
      return;
    }

    res.status(401).json({
      success: false,
      isLocked: true,
      code: 'PASSWORD_REQUIRED',
      error: 'Password required to access this agreement',
      scope: lockEval.scope,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Could not verify document security status' });
  }
}

/** Express middleware to enforce unlock token verification on protected template endpoints */
export async function requireTemplateUnlockGuard(req: Request, res: Response, next: any): Promise<void> {
  const id = req.params.id || req.body.templateId;
  if (!id) {
    next();
    return;
  }

  try {
    const tenantId = (req as any).tenantId;
    const client = { query: agreementPool.query.bind(agreementPool), tenantId };
    const lockEval = await evaluateTemplateLockStatus(client, id);

    if (!lockEval.isLocked) {
      next();
      return;
    }

    const unlockToken = (req.headers['x-agreement-unlock-token'] as string) || (req.query.unlockToken as string);
    const isValid = await validateTemplateUnlockSession(client, id, unlockToken);

    if (isValid) {
      next();
      return;
    }

    res.status(401).json({
      success: false,
      isLocked: true,
      code: 'PASSWORD_REQUIRED',
      error: 'Password required to access this template',
      scope: lockEval.scope,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Could not verify template security status' });
  }
}
