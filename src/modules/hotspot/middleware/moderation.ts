// src/modules/hotspot/middleware/moderation.ts
//
// Resolves "may this principal moderate the Hotspot?" once per request and
// stashes it on the request, so controllers can build a synchronous Actor.
//
// Moderation is deliberately NOT a gate on reaching these routes — every
// authenticated employee reads the noticeboard and posts to it. The flag only
// widens what a caller may do to SOMEONE ELSE's post: pin it, edit it, delete
// it. Ownership alone covers the common case.
//
// The permission reused is `opening.manage` — the same principal who
// administers the Hotspot job board administers its noticeboard. Adding a
// dedicated `hotspot.manage` key would need an RBAC seed to be useful, and
// would grant nobody anything until that ran.

import { NextFunction, Response } from 'express';
import { AuthRequest } from '@/types';
import { RBACService } from '@/modules/rbac/rbac.service';
import { Permissions } from '@/types/permissions';

export async function resolveModeration(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) {
    (req as any).hsCanModerate = false;
    next();
    return;
  }

  if (user.role === 'super_admin') {
    (req as any).hsCanModerate = true;
    next();
    return;
  }

  try {
    (req as any).hsCanModerate = await RBACService.hasPermission(
      user.id,
      user.tenantId,
      Permissions.OPENING_MANAGE,
      user.role
    );
  } catch (err) {
    // A permission lookup failure must not take down the feed — fail closed on
    // moderation, open on read/own-post writes.
    console.error('[hotspot] moderation lookup failed:', err);
    (req as any).hsCanModerate = false;
  }
  next();
}
