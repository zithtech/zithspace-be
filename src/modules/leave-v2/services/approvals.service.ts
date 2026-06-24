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
import { Actor, LeaveV2Error } from '../types';

export async function listApprovals(actor: Actor, canManageAll: boolean) {
  return withTenant(actor.tenantId, (client) =>
    canManageAll ? repo.listAll(client) : repo.listForApprover(client, actor.userId)
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

    // Recompute the split against the CURRENT balance.
    const balance = await repo.getBalanceFor(client, req.userId, req.leaveTypeId);
    const paid = Math.min(req.totalUnits, Math.max(balance, 0));
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
