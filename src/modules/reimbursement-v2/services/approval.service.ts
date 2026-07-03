// src/modules/reimbursement-v2/services/approval.service.ts
//
// Manager approval workflow. The reporting manager (users.reports_to_id, set as
// approver_id at submit time) decides pending claims: approve / reject / send
// back. Every decision appends to the rb2_claim_approvals audit trail.

import { TenantClient, withTenant } from '../db/pool';
import * as repo from '../repositories/claim.repo';
import { Actor, ApprovalInboxItem, ClaimDetail, ReimbursementV2Error } from '../types';

async function buildDetail(client: TenantClient, id: string): Promise<ClaimDetail> {
  const claim = await repo.findClaimById(client, id);
  if (!claim) throw ReimbursementV2Error.notFound('Claim');
  return {
    ...claim,
    items: await repo.findItems(client, id),
    attachments: await repo.findAttachments(client, id),
  };
}

/**
 * Load a pending claim and assert the actor may decide it: either they are the
 * assigned approver (the requester's reporting manager) OR they have manage-all
 * (super_admin / admin / REIMBURSEMENT_MANAGE). Nobody may decide their own claim.
 */
async function loadDecidable(client: TenantClient, id: string, actor: Actor, canManageAll: boolean) {
  const claim = await repo.findClaimById(client, id);
  if (!claim) throw ReimbursementV2Error.notFound('Claim');
  if (claim.userId === actor.userId) {
    throw ReimbursementV2Error.badRequest('You cannot decide on your own claim');
  }
  if (!canManageAll && claim.approverId !== actor.userId) {
    throw ReimbursementV2Error.forbidden("Only the requester's manager can decide this claim");
  }
  if (claim.status !== 'pending') {
    throw ReimbursementV2Error.badRequest(`Claim is ${claim.status}, not pending`);
  }
  return claim;
}

export async function listPending(actor: Actor, canManageAll: boolean): Promise<ApprovalInboxItem[]> {
  return withTenant(actor.tenantId, (client) =>
    canManageAll ? repo.findAllPending(client) : repo.findPendingForApprover(client, actor.userId)
  );
}

export async function getForApprover(actor: Actor, id: string, canManageAll: boolean): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await repo.findClaimById(client, id);
    if (!claim) throw ReimbursementV2Error.notFound('Claim');
    if (!canManageAll && claim.approverId !== actor.userId) {
      throw ReimbursementV2Error.forbidden('You are not the approver for this claim');
    }
    return buildDetail(client, id);
  });
}

export async function approve(actor: Actor, id: string, remarks: string | null, canManageAll: boolean): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    await loadDecidable(client, id, actor, canManageAll);
    await repo.setStatus(client, id, { status: 'approved', decidedAt: true, decisionNote: remarks ?? null }, actor.userId);
    await repo.insertApproval(client, id, actor.userId, 'approved', remarks ?? null);
    return buildDetail(client, id);
  });
}

export async function reject(actor: Actor, id: string, remarks: string | null, canManageAll: boolean): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    await loadDecidable(client, id, actor, canManageAll);
    await repo.setStatus(client, id, { status: 'rejected', decidedAt: true, decisionNote: remarks ?? null }, actor.userId);
    await repo.insertApproval(client, id, actor.userId, 'rejected', remarks ?? null);
    return buildDetail(client, id);
  });
}

/** Send back to the owner as a draft so they can amend and resubmit. */
export async function sendBack(actor: Actor, id: string, remarks: string | null, canManageAll: boolean): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    await loadDecidable(client, id, actor, canManageAll);
    await repo.setStatus(client, id, { status: 'draft', approverId: null, decisionNote: remarks ?? null }, actor.userId);
    await repo.insertApproval(client, id, actor.userId, 'sent_back', remarks ?? null);
    return buildDetail(client, id);
  });
}
