// src/modules/reimbursement-v2/services/finance.service.ts
//
// Finance settlement: list approved-but-unpaid claims and mark them paid with a
// payment reference. Gated by REIMBURSEMENT_PAY at the route layer.

import { TenantClient, withTenant } from '../db/pool';
import * as repo from '../repositories/claim.repo';
import * as advanceRepo from '../repositories/advance.repo';
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

export async function listPayable(actor: Actor, filter: { page?: number; limit?: number } = {}): Promise<{ data: ApprovalInboxItem[]; total: number }> {
  return withTenant(actor.tenantId, (client) => repo.findPayable(client, filter));
}

export async function getClaim(actor: Actor, id: string): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, (client) => buildDetail(client, id));
}

export async function markPaid(
  actor: Actor,
  id: string,
  data: { paymentReference: string; remarks?: string | null }
): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await repo.findClaimById(client, id);
    if (!claim) throw ReimbursementV2Error.notFound('Claim');
    if (claim.status !== 'approved') {
      throw ReimbursementV2Error.badRequest(`Only approved claims can be paid (claim is ${claim.status})`);
    }
    await repo.setStatus(
      client,
      id,
      {
        status: 'paid',
        paidAt: true,
        paidBy: actor.userId,
        paymentReference: data.paymentReference,
        decisionNote: data.remarks ?? claim.decisionNote ?? null,
      },
      actor.userId
    );
    await repo.insertApproval(client, id, actor.userId, 'paid', data.remarks ?? null);
    // If this claim settles an advance, refresh that advance's reconciliation.
    if (claim.advanceId) {
      await advanceRepo.recomputeReconciliation(client, claim.advanceId, actor.userId);
    }
    return buildDetail(client, id);
  });
}
