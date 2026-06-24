// src/modules/leave-v2/controllers/approvals.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { RBACService } from '@/modules/rbac/rbac.service';
import { Permissions } from '@/types/permissions';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/approvals.service';

// Can this user see/decide ALL requests (HR/admin), vs only their direct reports?
async function canManageAll(req: AuthRequest): Promise<boolean> {
  const u = req.user as any;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  return RBACService.hasPermission(u.id, u.tenantId, Permissions.LEAVE_MANAGE, u.role);
}

export const list = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listApprovals(actorOf(req), await canManageAll(req)));
});

export const approve = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.approve(actorOf(req), req.params.id, req.body?.note ?? null, await canManageAll(req)));
});

export const reject = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.reject(actorOf(req), req.params.id, req.body?.note ?? null, await canManageAll(req)));
});
