// src/modules/reimbursement-v2/services/advance.service.ts
//
// Cash-advance lifecycle: request → (manager) approve/reject → (finance) pay →
// reconcile against linked paid claims. Mirrors the claim workflow but a single
// amount, no line items.

import { EmailService } from '@/utils/emailService';
import * as settingsRepo from '../repositories/reimbursementSettings.repo';
import { TenantClient, withTenant } from '../db/pool';
import * as repo from '../repositories/advance.repo';
import * as claimRepo from '../repositories/claim.repo';
import { Actor, Advance, AdvanceInboxItem, ReimbursementV2Error } from '../types';
import { CreateAdvanceInput } from '../validators/advance.validator';

function assertOwner(a: Advance, actor: Actor): void {
  if (a.userId !== actor.userId) {
    throw ReimbursementV2Error.forbidden('You can only access your own advances');
  }
}

async function loadOwned(client: TenantClient, id: string, actor: Actor): Promise<Advance> {
  const a = await repo.findById(client, id);
  if (!a) throw ReimbursementV2Error.notFound('Advance');
  assertOwner(a, actor);
  return a;
}

async function loadDecidable(client: TenantClient, id: string, actor: Actor, canManageAll: boolean): Promise<Advance> {
  const a = await repo.findById(client, id);
  if (!a) throw ReimbursementV2Error.notFound('Advance');
  if (a.userId === actor.userId) {
    throw ReimbursementV2Error.badRequest('You cannot decide on your own advance');
  }
  if (!canManageAll && a.approverId !== actor.userId) {
    throw ReimbursementV2Error.forbidden("Only the requester's manager can decide this advance");
  }
  if (a.status !== 'pending') throw ReimbursementV2Error.badRequest(`Advance is ${a.status}, not pending`);
  return a;
}

// ── self-service ────────────────────────────────────────────────────────────
export async function requestAdvance(actor: Actor, input: CreateAdvanceInput): Promise<Advance> {
  return withTenant(actor.tenantId, async (client) => {
    const advanceNo = await repo.nextAdvanceNo(client);
    const advance = await repo.insert(client, {
      userId: actor.userId,
      advanceNo,
      purpose: input.purpose ?? null,
      amount: input.amount,
      currency: input.currency,
      neededBy: input.neededBy ?? null,
      createdBy: actor.userId,
    });
    // Route to the reporting manager (may be null → no approver).
    const approverId = await claimRepo.findReportsTo(client, actor.userId);
    const result = (await repo.setStatus(client, advance.id, { status: 'pending', approverId }, actor.userId)) as Advance;

    try {
      console.log(`[Reimbursement Email] Initiating email sequence for advance request: ${advance.advanceNo}`);
      const uData = await claimRepo.findUserBasic(client, actor.userId);
      const mId = approverId;
      const mData = mId ? await claimRepo.findUserBasic(client, mId) : null;
      console.log(`[Reimbursement Email] Requester:`, uData?.email, `Manager:`, mData?.email);

      if (uData) {
        const mailConfig = await settingsRepo.getSettings(client);
        console.log(`[Reimbursement Email] Mail Config:`, mailConfig);

        let replyToEmail = uData.email;
        if (mailConfig.replyToMode === 'custom' && mailConfig.customReplyToEmail) {
          replyToEmail = mailConfig.customReplyToEmail;
        }
        console.log(`[Reimbursement Email] Resolved Reply-To:`, replyToEmail);

        const toEmails = new Set<string>();
        if (mailConfig.reportsToEnabled && mData?.email) {
          toEmails.add(mData.email);
        }
        mailConfig.additionalToEmails?.forEach(e => toEmails.add(e));
        mailConfig.customToEmails?.forEach(e => toEmails.add(e));
        console.log(`[Reimbursement Email] Resolved To Emails:`, Array.from(toEmails));

        const ccEmails = new Set<string>();
        if (mailConfig.officeCcEnabled) {
          ccEmails.add('owner@zithtech.com');
        }
        mailConfig.additionalCcEmails?.forEach(e => ccEmails.add(e));
        mailConfig.customCcEmails?.forEach(e => ccEmails.add(e));
        console.log(`[Reimbursement Email] Resolved CC Emails:`, Array.from(ccEmails));

        if (toEmails.size > 0) {
          console.log(`[Reimbursement Email] Calling sendAdvanceSubmissionEmail...`);
          const emailService = new EmailService();
          emailService.sendAdvanceSubmissionEmail({
            to: Array.from(toEmails).join(','),
            cc: ccEmails.size > 0 ? Array.from(ccEmails).join(',') : undefined,
            replyTo: replyToEmail,
            managerName: mData?.name || 'Manager',
            employeeName: uData.name,
            employeeEmail: uData.email,
            advanceNo: advance.advanceNo,
            purpose: advance.purpose,
            amount: advance.amount,
            currency: advance.currency,
            neededBy: advance.neededBy,
          }, actor.tenantId)
            .then(res => console.log(`[Reimbursement Email] sendAdvanceSubmissionEmail success:`, res))
            .catch(err => console.error(`[Reimbursement Email] Failed to send submission email:`, err));
        } else {
          console.log(`[Reimbursement Email] No TO recipients found, skipping email.`);
        }
      }
    } catch (mailErr) {
      console.error('[Reimbursement Email] Fatal error in requestAdvance mail logic:', mailErr);
    }

    return result;
  });
}

export async function listMine(actor: Actor, filter: { status?: any } = {}): Promise<Advance[]> {
  return withTenant(actor.tenantId, (client) => repo.list(client, { userId: actor.userId, status: filter.status }));
}

export async function getMine(actor: Actor, id: string): Promise<Advance> {
  return withTenant(actor.tenantId, (client) => loadOwned(client, id, actor));
}

export async function cancel(actor: Actor, id: string, remarks?: string | null): Promise<Advance> {
  return withTenant(actor.tenantId, async (client) => {
    const a = await loadOwned(client, id, actor);
    if (!['pending', 'approved'].includes(a.status)) {
      throw ReimbursementV2Error.badRequest('Only pending or approved advances can be cancelled');
    }
    const result = (await repo.setStatus(
      client,
      id,
      { status: 'cancelled', decidedAt: true, decisionNote: remarks ?? null },
      actor.userId
    )) as Advance;

    try {
      console.log(`[Reimbursement Email] Initiating email sequence for cancelled advance: ${result.advanceNo}`);
      const uData = await claimRepo.findUserBasic(client, actor.userId);
      if (uData) {
        console.log(`[Reimbursement Email] Calling sendAdvanceRejectionEmail (cancel) to ${uData.email}...`);
        const emailService = new EmailService();
        emailService.sendAdvanceRejectionEmail({
          to: uData.email,
          employeeName: uData.name,
          advanceNo: result.advanceNo,
          amount: result.amount,
          currency: result.currency,
          status: 'cancelled',
          remarks: remarks
        }, actor.tenantId)
          .then(res => console.log(`[Reimbursement Email] sendAdvanceRejectionEmail success:`, res))
          .catch(err => console.error(`[Reimbursement Email] Failed to send cancel email:`, err));
      }
    } catch (mailErr) {
      console.error('[Reimbursement Email] Fatal error in cancel advance mail logic:', mailErr);
    }

    return result;
  });
}

// ── manager ─────────────────────────────────────────────────────────────────
export async function listPending(actor: Actor, canManageAll: boolean): Promise<AdvanceInboxItem[]> {
  return withTenant(actor.tenantId, (client) =>
    canManageAll ? repo.findAllPending(client) : repo.findPendingForApprover(client, actor.userId)
  );
}

export async function approve(actor: Actor, id: string, remarks: string | null, canManageAll: boolean): Promise<Advance> {
  return withTenant(actor.tenantId, async (client) => {
    await loadDecidable(client, id, actor, canManageAll);
    const result = (await repo.setStatus(
      client,
      id,
      { status: 'approved', decidedAt: true, decisionNote: remarks ?? null },
      actor.userId
    )) as Advance;

    try {
      console.log(`[Reimbursement Email] Initiating email sequence for approved advance: ${result.advanceNo}`);
      const uData = await claimRepo.findUserBasic(client, result.userId);
      const mData = await claimRepo.findUserBasic(client, actor.userId);
      if (uData) {
        console.log(`[Reimbursement Email] Calling sendAdvanceApprovalEmail to ${uData.email}...`);
        const emailService = new EmailService();
        emailService.sendAdvanceApprovalEmail({
          to: uData.email,
          employeeName: uData.name,
          approverName: mData?.name || 'Manager',
          advanceNo: result.advanceNo,
          amount: result.amount,
          currency: result.currency,
          remarks: remarks
        }, actor.tenantId)
          .then(res => console.log(`[Reimbursement Email] sendAdvanceApprovalEmail success:`, res))
          .catch(err => console.error(`[Reimbursement Email] Failed to send approval email:`, err));
      }
    } catch (mailErr) {
      console.error('[Reimbursement Email] Fatal error in advance approval mail logic:', mailErr);
    }

    return result;
  });
}

export async function reject(actor: Actor, id: string, remarks: string | null, canManageAll: boolean): Promise<Advance> {
  return withTenant(actor.tenantId, async (client) => {
    await loadDecidable(client, id, actor, canManageAll);
    const result = (await repo.setStatus(
      client,
      id,
      { status: 'rejected', decidedAt: true, decisionNote: remarks ?? null },
      actor.userId
    )) as Advance;

    try {
      console.log(`[Reimbursement Email] Initiating email sequence for rejected advance: ${result.advanceNo}`);
      const uData = await claimRepo.findUserBasic(client, result.userId);
      const mData = await claimRepo.findUserBasic(client, actor.userId);
      if (uData) {
        console.log(`[Reimbursement Email] Calling sendAdvanceRejectionEmail to ${uData.email}...`);
        const emailService = new EmailService();
        emailService.sendAdvanceRejectionEmail({
          to: uData.email,
          employeeName: uData.name,
          approverName: mData?.name || 'Manager',
          advanceNo: result.advanceNo,
          amount: result.amount,
          currency: result.currency,
          status: 'rejected',
          remarks: remarks
        }, actor.tenantId)
          .then(res => console.log(`[Reimbursement Email] sendAdvanceRejectionEmail success:`, res))
          .catch(err => console.error(`[Reimbursement Email] Failed to send rejection email:`, err));
      }
    } catch (mailErr) {
      console.error('[Reimbursement Email] Fatal error in advance rejection mail logic:', mailErr);
    }

    return result;
  });
}

// ── finance ─────────────────────────────────────────────────────────────────
export async function listPayable(actor: Actor): Promise<AdvanceInboxItem[]> {
  return withTenant(actor.tenantId, (client) => repo.findPayable(client));
}

export async function markPaid(
  actor: Actor,
  id: string,
  data: { paymentReference: string; remarks?: string | null }
): Promise<Advance> {
  return withTenant(actor.tenantId, async (client) => {
    const a = await repo.findById(client, id);
    if (!a) throw ReimbursementV2Error.notFound('Advance');
    if (a.status !== 'approved') {
      throw ReimbursementV2Error.badRequest(`Only approved advances can be paid (advance is ${a.status})`);
    }
    return (await repo.setStatus(
      client,
      id,
      { status: 'paid', paidAt: true, paidBy: actor.userId, paymentReference: data.paymentReference, decisionNote: data.remarks ?? a.decisionNote },
      actor.userId
    )) as Advance;
  });
}

/** Recompute reconciliation from linked paid claims (idempotent). */
export async function reconcile(actor: Actor, id: string): Promise<Advance> {
  return withTenant(actor.tenantId, async (client) => {
    const a = await repo.findById(client, id);
    if (!a) throw ReimbursementV2Error.notFound('Advance');
    return (await repo.recomputeReconciliation(client, id, actor.userId)) as Advance;
  });
}
