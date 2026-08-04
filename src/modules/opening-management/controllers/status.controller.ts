// src/modules/opening-management/controllers/status.controller.ts
// Thin HTTP layer for the Phase 3 lifecycle.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { RBACService } from '@/modules/rbac/rbac.service';
import { Permissions } from '@/types/permissions';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/status.service';
import { changeStatusSchema, holdSchema, resumeSchema } from '../validators/status.validator';
import { OpeningStatusState } from '../types';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

/** Unlocks the manage-only transitions (reopen, undo approval). */
async function canManage(req: AuthRequest): Promise<boolean> {
  const u = req.user as any;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  return RBACService.hasPermission(u.id, u.tenantId, Permissions.OPENING_MANAGE, u.role);
}

function logTransition(req: AuthRequest, state: OpeningStatusState, from: string): void {
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_DETAIL,
    action: Action.STATUS_CHANGE,
    actionLabel: `Opening "${state.openingCode}" moved from "${from}" to "${state.status}"`,
    entityType: EntityType.OPENING,
    entityId: state.openingId,
    entityLabel: state.openingCode,
    beforeData: { status: from },
    afterData: { status: state.status, reason: state.statusReason, note: state.statusNote },
    changedFields: ['status'],
  });
}

export const getState = handle(async (req: AuthRequest, res: Response) => {
  const state = await service.getStatusState(actorOf(req), req.params.id, {
    canManage: await canManage(req),
  });
  ok(res, state);
});

export const getHistory = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getHistory(actorOf(req), req.params.id));
});

export const changeStatus = handle(async (req: AuthRequest, res: Response) => {
  const input = changeStatusSchema.parse(req.body);
  const ctx = { canManage: await canManage(req) };
  const actor = actorOf(req);

  const before = await service.getStatusState(actor, req.params.id, ctx);
  const state = await service.changeStatus(actor, req.params.id, input, ctx);
  logTransition(req, state, before.status);
  ok(res, state);
});

export const hold = handle(async (req: AuthRequest, res: Response) => {
  const { note } = holdSchema.parse(req.body ?? {});
  const ctx = { canManage: await canManage(req) };
  const actor = actorOf(req);

  const before = await service.getStatusState(actor, req.params.id, ctx);
  const state = await service.hold(actor, req.params.id, note, ctx);
  logTransition(req, state, before.status);
  ok(res, state);
});

export const resume = handle(async (req: AuthRequest, res: Response) => {
  const { note } = resumeSchema.parse(req.body ?? {});
  const ctx = { canManage: await canManage(req) };
  const state = await service.resume(actorOf(req), req.params.id, note, ctx);
  logTransition(req, state, 'on_hold');
  ok(res, state);
});

/** Tenant-wide counts per status — the board header. */
export const summary = handle(async (req: AuthRequest, res: Response) => {
  const archived = ['exclude', 'include', 'only'].includes(String(req.query.archived))
    ? (req.query.archived as 'exclude' | 'include' | 'only')
    : 'exclude';
  ok(res, await service.getStatusSummary(actorOf(req), archived));
});

/** The lifecycle as data, so the UI need not hard-code the rules. */
export const catalog = handle(async (_req: AuthRequest, res: Response) => {
  ok(res, service.getStatusCatalog());
});
