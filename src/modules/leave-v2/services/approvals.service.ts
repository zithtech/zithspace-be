// src/modules/leave-v2/services/approvals.service.ts
//
// Manager approvals. Routing: a request is decided by the requester's manager
// (users.reports_to_id). Users with manage-all (leave.manage / admin) see and
// decide everything — the override for top-of-hierarchy people with no manager.
//
// On approve, the paid/LOP split is RECOMPUTED against the balance at decision
// time, then a ledger debit is written for the paid portion.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/leaveRequest.repo';
import { computeWithdrawalPlan } from './leaveRequest.service';
import { Actor, LeaveV2Error } from '../types';

export async function listApprovals(actor: Actor, canManageAll: boolean, opts?: repo.ApprovalOpts) {
  return withTenant(actor.tenantId, (client) =>
    canManageAll ? repo.listAll(client, opts) : repo.listForApprover(client, actor.userId, opts)
  );
}

function assertCanDecide(req: repo.LeaveRequestRow, actor: Actor, canManageAll: boolean) {
  if (req.userId === actor.userId) {
    throw LeaveV2Error.badRequest('You cannot decide on your own request');
  }
  if (!canManageAll && req.reportsToId !== actor.userId) {
    throw LeaveV2Error.forbidden("Only the requester's manager can decide this request");
  }
}

export async function approve(actor: Actor, id: string, note: string | null, canManageAll: boolean) {
  return withTenant(actor.tenantId, async (client) => {
    const req = await repo.findAnyById(client, id);
    if (!req) throw LeaveV2Error.notFound('Leave request');
    if (req.status !== 'pending') throw LeaveV2Error.badRequest('Only pending requests can be approved');
    assertCanDecide(req, actor, canManageAll);

    // Recompute the split against the CURRENT balance (adding back this request's hold).
    const balance = await repo.getBalanceFor(client, req.userId, req.leaveTypeId);
    const availableForThisReq = balance + req.paidUnits;
    const paid = Math.min(req.totalUnits, Math.max(availableForThisReq, 0));
    const lop = Number((req.totalUnits - paid).toFixed(2));

    const updated = await repo.approveRequest(client, id, { paid, lop, approverId: actor.userId, note });
    if (!updated) throw LeaveV2Error.badRequest('Request is no longer pending');

    if (paid > 0) {
      await repo.insertLeaveDebit(client, {
        userId: req.userId,
        leaveTypeId: req.leaveTypeId,
        units: paid,
        requestId: id,
        effectiveDate: req.fromDate,
        createdBy: actor.userId,
      });
    }
    return updated;
  });
}

export async function reject(actor: Actor, id: string, note: string | null, canManageAll: boolean) {
  return withTenant(actor.tenantId, async (client) => {
    const req = await repo.findAnyById(client, id);
    if (!req) throw LeaveV2Error.notFound('Leave request');
    if (req.status !== 'pending') throw LeaveV2Error.badRequest('Only pending requests can be rejected');
    assertCanDecide(req, actor, canManageAll);

    const updated = await repo.rejectRequest(client, id, { approverId: actor.userId, note });
    if (!updated) throw LeaveV2Error.badRequest('Request is no longer pending');
    return updated;
  });
}

/**
 * Manager decides on an employee's withdrawal request (release of unused days).
 * On confirm, the paid portion released is credited back to the ledger; the
 * request is either shortened (stays approved) or fully released ('withdrawn').
 */
export async function decideWithdrawal(
  actor: Actor,
  id: string,
  approve: boolean,
  note: string | null,
  canManageAll: boolean
) {
  return withTenant(actor.tenantId, async (client) => {
    const req = await repo.findAnyById(client, id);
    if (!req) throw LeaveV2Error.notFound('Leave request');
    if (req.status !== 'approved' || req.withdrawalStatus !== 'requested') {
      throw LeaveV2Error.badRequest('There is no pending withdrawal request to decide');
    }
    assertCanDecide(req, actor, canManageAll);

    if (!approve) {
      const declined = await repo.declineWithdrawal(client, id, { actorId: actor.userId, note });
      if (!declined) throw LeaveV2Error.badRequest('The withdrawal request is no longer pending');
      return { before: req, request: declined, plan: null };
    }

    // Recompute the release from the stored ask (defends against balance drift).
    const plan = await computeWithdrawalPlan(client, req, {
      releaseAll: req.withdrawalNewToDate == null,
      newToDate: req.withdrawalNewToDate,
    });

    const updated =
      plan.mode === 'full'
        ? await repo.confirmWithdrawalFull(client, id, {
            requestedUnits: plan.releasedTotal,
            actorId: actor.userId,
            note,
          })
        : await repo.confirmWithdrawalShorten(client, id, {
            newToDate: plan.newToDate!,
            totalUnits: plan.actualUnits,
            paidUnits: plan.newPaid,
            lopUnits: plan.newLop,
            requestedUnits: plan.releasedTotal,
            actorId: actor.userId,
            note,
          });
    if (!updated) throw LeaveV2Error.badRequest('The withdrawal request is no longer pending');

    // Credit back only the paid days that were released (LOP never debited).
    if (plan.releasedPaid > 0) {
      await repo.insertLeaveCredit(client, {
        userId: req.userId,
        leaveTypeId: req.leaveTypeId,
        units: plan.releasedPaid,
        requestId: id,
        effectiveDate: req.fromDate,
        note: 'Leave withdrawal — released unused days',
        createdBy: actor.userId,
      });
    }

    return { before: req, request: updated, plan };
  });
}
