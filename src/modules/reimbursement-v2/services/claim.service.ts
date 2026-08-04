// src/modules/reimbursement-v2/services/claim.service.ts
//
// Self-service claim lifecycle: draft → submit → (auto-approve | pending).
// Owns the transaction boundary and every rule:
//   - only the owner may touch their claim; only drafts are editable
//   - receipt requirements (per category)
//   - spend limits (per-claim / per-day / monthly / yearly, category-level)
//   - approver resolution via the reporting manager (users.reports_to_id)
//
// NOTE: policy-line limit OVERRIDES (per grade/department) are stored and
// managed by the policy slice but not yet resolved here — v1 enforces the
// category-level limits, which the plan scopes as the first cut. Auto-approve is
// resolved from org/user-scoped policies (resolvable without employee attrs).

import { TenantClient, withTenant } from '../db/pool';
import { generatePresignedUrl } from '@/utils/r2Client';
import { EmailService } from '@/utils/emailService';
import * as repo from '../repositories/claim.repo';
import * as categoryRepo from '../repositories/category.repo';
import * as advanceRepo from '../repositories/advance.repo';
import * as policyRepo from '../repositories/policy.repo';
import * as settingsRepo from '../repositories/reimbursementSettings.repo';
import {
  Actor,
  Claim,
  ClaimDetail,
  ClaimStatus,
  ExpenseCategory,
  ReimbursementV2Error,
} from '../types';
import {
  CreateClaimInput,
  ItemInput,
  UpdateClaimInput,
  UpdateItemInput,
} from '../validators/claim.validator';

// ── date windows for period limits ──────────────────────────────────────────
function monthRange(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
function yearRange(date: string): { from: string; to: string } {
  const y = date.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Resolve the payable amount for an item given its category kind:
//   - mileage  → amount = distance × category.mileage_rate (distance required)
//   - amount   → amount as entered (required)
function computeAmount(
  cat: ExpenseCategory,
  input: { amount?: number | null; distance?: number | null }
): { amount: number; distance: number | null } {
  if (cat.kind === 'mileage') {
    if (input.distance == null || input.distance <= 0) {
      throw ReimbursementV2Error.badRequest(`${cat.name}: distance is required for a mileage category`);
    }
    if (cat.mileageRate == null || cat.mileageRate <= 0) {
      throw ReimbursementV2Error.badRequest(`${cat.name}: mileage category has no rate configured`);
    }
    return { amount: round2(input.distance * cat.mileageRate), distance: input.distance };
  }
  if (input.amount == null || input.amount <= 0) {
    throw ReimbursementV2Error.badRequest(`${cat.name}: amount is required`);
  }
  return { amount: input.amount, distance: null };
}

// ── guards ──────────────────────────────────────────────────────────────────
function assertOwner(claim: { userId: string }, actor: Actor): void {
  if (claim.userId !== actor.userId) {
    throw ReimbursementV2Error.forbidden('You can only access your own claims');
  }
}
function assertDraft(claim: { status: ClaimStatus }): void {
  if (claim.status !== 'draft') {
    throw ReimbursementV2Error.badRequest('Only draft claims can be edited');
  }
}

async function loadOwnedClaim(
  client: TenantClient,
  id: string,
  actor: Actor
): Promise<Awaited<ReturnType<typeof repo.findClaimById>>> {
  const claim = await repo.findClaimById(client, id);
  if (!claim) throw ReimbursementV2Error.notFound('Claim');
  assertOwner(claim, actor);
  return claim;
}

async function assertCategory(
  client: TenantClient,
  categoryId: string
): Promise<ExpenseCategory> {
  const cat = await categoryRepo.findById(client, categoryId);
  if (!cat) throw ReimbursementV2Error.badRequest(`Unknown expense category ${categoryId}`);
  return cat;
}

// A claim may only link to the actor's own advance that has actually been paid
// out (or is mid-reconciliation). Rejected/cancelled/pending advances are invalid.
async function assertLinkableAdvance(
  client: TenantClient,
  advanceId: string,
  actor: Actor
): Promise<void> {
  const adv = await advanceRepo.findById(client, advanceId);
  if (!adv || adv.userId !== actor.userId) {
    throw ReimbursementV2Error.badRequest('advanceId does not reference one of your advances');
  }
  if (!['paid', 'partially_reconciled'].includes(adv.status)) {
    throw ReimbursementV2Error.badRequest(`Advance ${adv.advanceNo} is ${adv.status}; it must be paid to reconcile against`);
  }
}

async function buildDetail(client: TenantClient, id: string): Promise<ClaimDetail> {
  const claim = await repo.findClaimById(client, id);
  if (!claim) throw ReimbursementV2Error.notFound('Claim');

  const attachments = await repo.findAttachments(client, id);
  for (const attachment of attachments) {
    if (attachment.fileUrl) {
      try {
        attachment.fileUrl = await generatePresignedUrl(attachment.fileUrl, 86400);
      } catch (e) {
        console.error('Failed to presign URL for attachment', attachment.id, e);
      }
    }
  }

  return {
    ...claim,
    items: await repo.findItems(client, id),
    attachments,
  };
}

// ── create / read / update draft ────────────────────────────────────────────
export async function createClaim(actor: Actor, input: CreateClaimInput): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    if (input.advanceId) await assertLinkableAdvance(client, input.advanceId, actor);
    const claimNo = await repo.nextClaimNo(client);
    const claim = await repo.insertClaim(client, {
      userId: actor.userId,
      claimNo,
      title: input.title ?? null,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      baseCurrency: input.baseCurrency,
      advanceId: input.advanceId ?? null,
      projectId: input.projectId ?? null,
      departmentId: input.departmentId ?? null,
      createdBy: actor.userId,
    });
    for (const item of input.items) {
      const cat = await assertCategory(client, item.categoryId);
      const { amount, distance } = computeAmount(cat, item);
      await repo.insertItem(client, claim.id, {
        categoryId: item.categoryId,
        expenseDate: item.expenseDate,
        merchant: item.merchant ?? null,
        billNo: item.billNo ?? null,
        amount,
        taxAmount: item.taxAmount ?? 0,
        distance,
        description: item.description ?? null,
      });
    }
    if (input.items.length) await repo.recomputeTotal(client, claim.id);
    return buildDetail(client, claim.id);
  });
}


async function assertClaimLimits(
  client: TenantClient,
  userId: string,
  items: Array<{ categoryId: string; expenseDate: string; amount: number }>,
  claimId?: string
) {
  const policy = await policyRepo.findApplicablePolicy(client, userId);
  const cats = new Map<string, ExpenseCategory>();
  const catFor = async (cid: string) => {
    if (!cats.has(cid)) cats.set(cid, await assertCategory(client, cid));
    return cats.get(cid)!;
  };
  const lims = new Map<string, any>();
  const limitsFor = async (cat: ExpenseCategory) => {
    if (!lims.has(cat.id)) {
      const ov = policy ? await policyRepo.findLineForCategory(client, policy.id, cat.id) : null;
      lims.set(cat.id, {
        maxPerClaim: ov?.maxPerClaim ?? cat.maxPerClaim,
        monthlyLimit: ov?.monthlyLimit ?? cat.monthlyLimit,
        yearlyLimit: ov?.yearlyLimit ?? cat.yearlyLimit,
        perDayLimit: ov?.perDayLimit ?? cat.perDayLimit,
      });
    }
    return lims.get(cat.id)!;
  };

  const dayKeys = new Set<string>();
  const monthKeys = new Set<string>();
  const yearKeys = new Set<string>();

  for (const item of items) {
    const cat = await catFor(item.categoryId);
    const lim = await limitsFor(cat);

    if (lim.maxPerClaim != null && item.amount > lim.maxPerClaim) {
      throw ReimbursementV2Error.badRequest(
        `${cat.name}: ${item.amount} exceeds the per-item limit of ${lim.maxPerClaim}`
      );
    }

    if (lim.perDayLimit != null) {
      const key = `${cat.id}|${item.expenseDate}`;
      if (!dayKeys.has(key)) {
        dayKeys.add(key);
        const dbTotal = await repo.periodSum(client, userId, cat.id, item.expenseDate, item.expenseDate, claimId || null);
        const reqTotal = claimId ? 0 : items.filter(i => i.categoryId === cat.id && i.expenseDate === item.expenseDate).reduce((s, i) => s + i.amount, 0);
        if (dbTotal + reqTotal > lim.perDayLimit) {
          throw ReimbursementV2Error.badRequest(
            `${cat.name}: ${dbTotal + reqTotal} on ${item.expenseDate} exceeds the daily limit of ${lim.perDayLimit}`
          );
        }
      }
    }
    if (lim.monthlyLimit != null) {
      const { from, to } = monthRange(item.expenseDate);
      const key = `${cat.id}|${from}`;
      if (!monthKeys.has(key)) {
        monthKeys.add(key);
        const dbTotal = await repo.periodSum(client, userId, cat.id, from, to, claimId || null);
        const reqTotal = claimId ? 0 : items.filter(i => i.categoryId === cat.id && monthRange(i.expenseDate).from === from).reduce((s, i) => s + i.amount, 0);
        if (dbTotal + reqTotal > lim.monthlyLimit) {
          throw ReimbursementV2Error.badRequest(
            `${cat.name}: ${dbTotal + reqTotal} for ${from.slice(0, 7)} exceeds the monthly limit of ${lim.monthlyLimit}`
          );
        }
      }
    }
    if (lim.yearlyLimit != null) {
      const { from, to } = yearRange(item.expenseDate);
      const key = `${cat.id}|${from}`;
      if (!yearKeys.has(key)) {
        yearKeys.add(key);
        const dbTotal = await repo.periodSum(client, userId, cat.id, from, to, claimId || null);
        const reqTotal = claimId ? 0 : items.filter(i => i.categoryId === cat.id && yearRange(i.expenseDate).from === from).reduce((s, i) => s + i.amount, 0);
        if (dbTotal + reqTotal > lim.yearlyLimit) {
          throw ReimbursementV2Error.badRequest(
            `${cat.name}: ${dbTotal + reqTotal} for ${from.slice(0, 4)} exceeds the yearly limit of ${lim.yearlyLimit}`
          );
        }
      }
    }
  }
}

export async function validateClaimLimitsEndpoint(actor: Actor, input: CreateClaimInput) {
  return withTenant(actor.tenantId, async (client) => {
    const computed = [];
    for (const item of input.items) {
      const cat = await assertCategory(client, item.categoryId);
      const { amount } = computeAmount(cat, item);
      computed.push({ categoryId: item.categoryId, expenseDate: item.expenseDate, amount });
    }
    await assertClaimLimits(client, actor.userId, computed);
  });
}

export async function listMyClaims(
  actor: Actor,
  filter: { status?: ClaimStatus } = {}
): Promise<Claim[]> {
  return withTenant(actor.tenantId, (client) =>
    repo.listClaims(client, { userId: actor.userId, status: filter.status })
  );
}

export async function getMyClaim(actor: Actor, id: string): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    return buildDetail(client, claim!.id);
  });
}

export async function updateClaim(
  actor: Actor,
  id: string,
  input: UpdateClaimInput
): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    assertDraft(claim!);
    if (input.advanceId) await assertLinkableAdvance(client, input.advanceId, actor);
    await repo.updateClaimHeader(client, id, input, actor.userId);
    // exchange_rate may have changed → refresh base_amount from items.
    await repo.recomputeTotal(client, id);
    return buildDetail(client, id);
  });
}

export async function deleteClaim(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    assertDraft(claim!);
    await repo.softDeleteClaim(client, id, actor.userId);
  });
}

// ── items ───────────────────────────────────────────────────────────────────
export async function addItem(actor: Actor, id: string, input: ItemInput): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    assertDraft(claim!);
    const cat = await assertCategory(client, input.categoryId);
    const { amount, distance } = computeAmount(cat, input);
    await repo.insertItem(client, id, {
      categoryId: input.categoryId,
      expenseDate: input.expenseDate,
      merchant: input.merchant ?? null,
      billNo: input.billNo ?? null,
      amount,
      taxAmount: input.taxAmount ?? 0,
      distance,
      description: input.description ?? null,
    });
    await repo.recomputeTotal(client, id);
    return buildDetail(client, id);
  });
}

export async function updateItem(
  actor: Actor,
  id: string,
  itemId: string,
  input: UpdateItemInput
): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    assertDraft(claim!);
    const existing = await repo.findItemById(client, id, itemId);
    if (!existing) throw ReimbursementV2Error.notFound('Claim item');

    // Merge patch over the existing row, then recompute the amount for the
    // effective category (kind may have changed via a new categoryId).
    const categoryId = input.categoryId ?? existing.categoryId;
    const cat = await assertCategory(client, categoryId);
    const { amount, distance } = computeAmount(cat, {
      amount: input.amount !== undefined ? input.amount : existing.amount,
      distance: input.distance !== undefined ? input.distance : existing.distance,
    });

    const updated = await repo.updateItem(client, id, itemId, {
      categoryId,
      expenseDate: input.expenseDate ?? existing.expenseDate,
      merchant: input.merchant !== undefined ? input.merchant : existing.merchant,
      billNo: input.billNo !== undefined ? input.billNo : existing.billNo,
      amount,
      taxAmount: input.taxAmount !== undefined ? input.taxAmount : existing.taxAmount,
      distance,
      description: input.description !== undefined ? input.description : existing.description,
    });
    if (!updated) throw ReimbursementV2Error.notFound('Claim item');
    await repo.recomputeTotal(client, id);
    return buildDetail(client, id);
  });
}

export async function removeItem(actor: Actor, id: string, itemId: string): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    assertDraft(claim!);
    const ok = await repo.deleteItem(client, id, itemId);
    if (!ok) throw ReimbursementV2Error.notFound('Claim item');
    await repo.recomputeTotal(client, id);
    return buildDetail(client, id);
  });
}

// ── receipts ────────────────────────────────────────────────────────────────
export async function addAttachment(
  actor: Actor,
  id: string,
  data: {
    claimItemId?: string | null;
    fileName: string;
    fileUrl: string;
    fileSize?: number | null;
    fileType?: string | null;
  }
): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    assertDraft(claim!);
    if (data.claimItemId) {
      const item = await repo.findItemById(client, id, data.claimItemId);
      if (!item) throw ReimbursementV2Error.badRequest('claimItemId does not belong to this claim');
    }
    await repo.insertAttachment(client, id, { ...data, uploadedBy: actor.userId });
    return buildDetail(client, id);
  });
}

export async function removeAttachment(
  actor: Actor,
  id: string,
  attachmentId: string
): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    assertDraft(claim!);
    const removed = await repo.deleteAttachment(client, id, attachmentId);
    if (!removed) throw ReimbursementV2Error.notFound('Attachment');
    return buildDetail(client, id);
  });
}

// ── submit (validate → route) ───────────────────────────────────────────────
export async function submitClaim(actor: Actor, id: string): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    assertDraft(claim!);

    const items = await repo.findItems(client, id);
    if (items.length === 0) {
      throw ReimbursementV2Error.badRequest('A claim needs at least one item before submission');
    }

    const attachments = await repo.findAttachments(client, id);
    const hasClaimLevelReceipt = attachments.some((a) => a.claimItemId == null);

    // Resolve the policy applicable to this employee once (by org scope). Its
    // per-category lines override the category-level limits, field by field.
    const policy = await policyRepo.findApplicablePolicy(client, actor.userId);

    // Cache categories + their EFFECTIVE limits (category defaults with any
    // policy line override applied).
    const catCache = new Map<string, ExpenseCategory>();
    const limitCache = new Map<string, policyRepo.LineLimits>();
    const catFor = async (cid: string) => {
      if (!catCache.has(cid)) catCache.set(cid, await assertCategory(client, cid));
      return catCache.get(cid)!;
    };
    const limitsFor = async (cat: ExpenseCategory): Promise<policyRepo.LineLimits> => {
      if (!limitCache.has(cat.id)) {
        const ov = policy ? await policyRepo.findLineForCategory(client, policy.id, cat.id) : null;
        limitCache.set(cat.id, {
          maxPerClaim: ov?.maxPerClaim ?? cat.maxPerClaim,
          monthlyLimit: ov?.monthlyLimit ?? cat.monthlyLimit,
          yearlyLimit: ov?.yearlyLimit ?? cat.yearlyLimit,
          perDayLimit: ov?.perDayLimit ?? cat.perDayLimit,
        });
      }
      return limitCache.get(cat.id)!;
    };

    // 1) receipt rules
    for (const item of items) {
      const cat = await assertCategory(client, item.categoryId);
      const needsReceipt =
        cat.receiptRequired ||
        (cat.receiptRequiredAbove != null && item.amount > cat.receiptRequiredAbove);
      if (needsReceipt) {
        const hasReceipt =
          hasClaimLevelReceipt || attachments.some((a) => a.claimItemId === item.id);
        if (!hasReceipt) {
          throw ReimbursementV2Error.badRequest(
            `${cat.name}: a receipt is required for the ${item.expenseDate} expense`
          );
        }
      }
    }

    // 2) period and per-claim limits
    await assertClaimLimits(client, actor.userId, items, id);

    const total = await repo.recomputeTotal(client, id);

    // 3) route: auto-approve under the applicable policy's threshold, else
    //    pending to the manager
    const threshold = policy?.autoApproveBelow ?? null;
    const autoApprove = threshold != null && total <= threshold;

    if (autoApprove) {
      await repo.setStatus(
        client,
        id,
        { status: 'approved', submittedAt: true, decidedAt: true, decisionNote: 'Auto-approved (under threshold)' },
        actor.userId
      );
      await repo.insertApproval(client, id, actor.userId, 'submitted');
      await repo.insertApproval(client, id, actor.userId, 'approved', 'Auto-approved (under threshold)');
    } else {
      const approverId = await repo.findReportsTo(client, actor.userId);
      await repo.setStatus(client, id, { status: 'pending', submittedAt: true, approverId }, actor.userId);
      await repo.insertApproval(client, id, actor.userId, 'submitted');

      try {
        console.log(`[Reimbursement Email] Initiating email sequence for submitted claim: ${claim.claimNo}`);
        const uData = await repo.findUserBasic(client, actor.userId);
        const mId = approverId;
        const mData = mId ? await repo.findUserBasic(client, mId) : null;
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
          mailConfig.additionalCcEmails?.forEach(e => ccEmails.add(e));
          mailConfig.customCcEmails?.forEach(e => ccEmails.add(e));

          if (toEmails.size > 0) {
            console.log(`[Reimbursement Email] Calling sendClaimSubmissionEmail...`);
            const emailService = new EmailService();
            emailService.sendClaimSubmissionEmail({
              to: Array.from(toEmails).join(','),
              cc: ccEmails.size > 0 ? Array.from(ccEmails).join(',') : undefined,
              replyTo: replyToEmail,
              managerName: mData?.name || 'Manager',
              employeeName: uData.name,
              employeeEmail: uData.email,
              claimNo: claim.claimNo,
              title: claim.title,
              totalAmount: total,
              currency: claim.currency,
              itemCount: items.length,
            }, actor.tenantId)
              .then(res => console.log(`[Reimbursement Email] sendClaimSubmissionEmail success:`, res))
              .catch(err => console.error(`[Reimbursement Email] Failed to send submission email:`, err));
          } else {
            console.log(`[Reimbursement Email] No TO recipients found, skipping email.`);
          }
        }
      } catch (mailErr) {
        console.error('[Reimbursement Email] Fatal error in submission mail logic:', mailErr);
      }
    }

    return buildDetail(client, id);
  });
}

// ── cancel (owner withdraws) ────────────────────────────────────────────────
export async function cancelClaim(actor: Actor, id: string, remarks?: string | null): Promise<ClaimDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const claim = await loadOwnedClaim(client, id, actor);
    if (!['draft', 'pending'].includes(claim!.status)) {
      throw ReimbursementV2Error.badRequest('Only draft or pending claims can be cancelled');
    }
    await repo.setStatus(client, id, { status: 'cancelled', decidedAt: true, decisionNote: remarks ?? null }, actor.userId);
    await repo.insertApproval(client, id, actor.userId, 'cancelled', remarks ?? null);

    try {
      console.log(`[Reimbursement Email] Initiating email sequence for cancelled claim: ${claim!.claimNo}`);
      const uData = await repo.findUserBasic(client, actor.userId);
      if (uData) {
        console.log(`[Reimbursement Email] Calling sendClaimRejectionEmail (cancel) to ${uData.email}...`);
        const emailService = new EmailService();
        emailService.sendClaimRejectionEmail({
          to: uData.email,
          employeeName: uData.name,
          approverName: '',
          claimNo: claim!.claimNo,
          title: claim!.title,
          totalAmount: claim!.totalAmount,
          currency: claim!.currency,
          status: 'cancelled',
          remarks: remarks
        }, actor.tenantId)
          .then(res => console.log(`[Reimbursement Email] sendClaimRejectionEmail success:`, res))
          .catch(err => console.error(`[Reimbursement Email] Failed to send cancel email:`, err));
      }
    } catch (mailErr) {
      console.error('[Reimbursement Email] Fatal error in cancel mail logic:', mailErr);
    }

    return buildDetail(client, id);
  });
}
