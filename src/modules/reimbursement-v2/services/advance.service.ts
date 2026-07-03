// src/modules/reimbursement-v2/services/advance.service.ts
//
// Cash-advance lifecycle: request → (manager) approve/reject → (finance) pay →
// reconcile against linked paid claims. Mirrors the claim workflow but a single
// amount, no line items.

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
    return (await repo.setStatus(client, advance.id, { status: 'pending', approverId }, actor.userId)) as Advance;
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
    return (await repo.setStatus(
      client,
      id,
      { status: 'cancelled', decidedAt: true, decisionNote: remarks ?? null },
      actor.userId
    )) as Advance;
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
    return (await repo.setStatus(
      client,
      id,
      { status: 'approved', decidedAt: true, decisionNote: remarks ?? null },
      actor.userId
    )) as Advance;
  });
}

export async function reject(actor: Actor, id: string, remarks: string | null, canManageAll: boolean): Promise<Advance> {
  return withTenant(actor.tenantId, async (client) => {
    await loadDecidable(client, id, actor, canManageAll);
    return (await repo.setStatus(
      client,
      id,
      { status: 'rejected', decidedAt: true, decisionNote: remarks ?? null },
      actor.userId
    )) as Advance;
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
