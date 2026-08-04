// src/modules/opening-management/controllers/approval.controller.ts
// Thin HTTP layer for the approval engine: submit / approve / reject / skip /
// withdraw, plus the pending queue.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { RBACService } from '@/modules/rbac/rbac.service';
import { Permissions } from '@/types/permissions';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/approval.service';
import { decisionSchema, rejectionSchema, submitSchema } from '../validators/approval.validator';
import { OpeningApprovalState } from '../types';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

/**
 * Can this user act on ANY step and see every pending approval (HR/admin), as
 * opposed to only the steps they are named on? Mirrors the leave-v2 convention.
 */
async function canManageAll(req: AuthRequest): Promise<boolean> {
  const u = req.user as any;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  return RBACService.hasPermission(u.id, u.tenantId, Permissions.OPENING_MANAGE, u.role);
}

const label = (s: OpeningApprovalState) => `${s.opening.openingCode} — ${s.opening.jobTitle}`;

/** The step just acted on: newest round, highest step already decided. */
function decidedStepName(state: OpeningApprovalState, fallback: string): string {
  const latest = state.rounds[0];
  if (!latest) return fallback;
  const decided = latest.steps.filter((s) => s.status !== 'pending');
  return decided.length > 0 ? decided[decided.length - 1].stepName : fallback;
}

export const submit = handle(async (req: AuthRequest, res: Response) => {
  const input = submitSchema.parse(req.body ?? {});
  const state = await service.submitForApproval(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_APPROVALS,
    action: Action.SUBMIT,
    actionLabel: `Submitted opening "${label(state)}" for approval (round ${state.opening.approvalRound})`,
    entityType: EntityType.OPENING,
    entityId: state.opening.id,
    entityLabel: label(state),
    afterData: {
      status: state.opening.status,
      round: state.opening.approvalRound,
      steps: state.rounds[0]?.steps.map((s) => s.stepName) ?? [],
    },
  });
  ok(res, state);
});

export const approve = handle(async (req: AuthRequest, res: Response) => {
  const { note } = decisionSchema.parse(req.body ?? {});
  const state = await service.approve(actorOf(req), req.params.id, note, {
    canManageAll: await canManageAll(req),
  });
  const step = decidedStepName(state, 'approval step');
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_APPROVALS,
    action: Action.APPROVE,
    actionLabel:
      state.opening.status === 'approved'
        ? `Approved "${step}" — opening "${label(state)}" is fully approved`
        : `Approved "${step}" for opening "${label(state)}"`,
    entityType: EntityType.OPENING_APPROVAL,
    entityId: state.opening.id,
    entityLabel: label(state),
    afterData: { step, status: state.opening.status, note },
  });
  ok(res, state);
});

export const reject = handle(async (req: AuthRequest, res: Response) => {
  const { note } = rejectionSchema.parse(req.body ?? {});
  const state = await service.reject(actorOf(req), req.params.id, note, {
    canManageAll: await canManageAll(req),
  });
  const step = decidedStepName(state, 'approval step');
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_APPROVALS,
    action: Action.REJECT,
    actionLabel: `Rejected "${step}" for opening "${label(state)}" — returned to draft`,
    entityType: EntityType.OPENING_APPROVAL,
    entityId: state.opening.id,
    entityLabel: label(state),
    afterData: { step, status: state.opening.status, note },
  });
  ok(res, state);
});

export const skip = handle(async (req: AuthRequest, res: Response) => {
  const { note } = decisionSchema.parse(req.body ?? {});
  const state = await service.skip(actorOf(req), req.params.id, note, {
    canManageAll: await canManageAll(req),
  });
  const step = decidedStepName(state, 'optional step');
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_APPROVALS,
    action: Action.STATUS_CHANGE,
    actionLabel: `Skipped optional step "${step}" for opening "${label(state)}"`,
    entityType: EntityType.OPENING_APPROVAL,
    entityId: state.opening.id,
    entityLabel: label(state),
    afterData: { step, status: state.opening.status, note },
  });
  ok(res, state);
});

export const withdraw = handle(async (req: AuthRequest, res: Response) => {
  const { note } = decisionSchema.parse(req.body ?? {});
  const state = await service.withdraw(actorOf(req), req.params.id, note, {
    canManageAll: await canManageAll(req),
  });
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_APPROVALS,
    action: Action.CANCEL,
    actionLabel: `Withdrew opening "${label(state)}" from approval — returned to draft`,
    entityType: EntityType.OPENING_APPROVAL,
    entityId: state.opening.id,
    entityLabel: label(state),
    afterData: { status: state.opening.status, note },
  });
  ok(res, state);
});

export const getTrail = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getApprovalState(actorOf(req), req.params.id));
});

/**
 * `GET /approvals/pending` — the caller's queue. HR/admins get every pending
 * approval; pass `?mine=true` to narrow it back to their own steps.
 */
export const listPending = handle(async (req: AuthRequest, res: Response) => {
  const viewAll = (await canManageAll(req)) && req.query.mine !== 'true';
  ok(res, await service.listPendingApprovals(actorOf(req), viewAll));
});
