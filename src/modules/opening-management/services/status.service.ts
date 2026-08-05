// src/modules/opening-management/services/status.service.ts
//
// The Phase 3 lifecycle engine. It enforces the transition map in
// statusMachine.ts, writes the append-only timeline, and runs the side effects a
// move implies (closing outstanding approvals when an opening is cancelled
// mid-review, stamping closed_at, …).
//
// Phase 2's moves — submit / approve / reject / withdraw — are NOT reachable
// here: they are marked `ownedBy: 'approval'` in the map so that routing a
// status change cannot walk past the approval chain. They still append to the
// same timeline, via recordApprovalTransition() below.

import { TenantClient, withTenant } from '../db/pool';
import * as openingRepo from '../repositories/opening.repo';
import * as statusRepo from '../repositories/openingStatus.repo';
import * as approvalRepo from '../repositories/openingApproval.repo';
import * as postingRepo from '../repositories/posting.repo';
import {
  Actor,
  Opening,
  OpeningStatus,
  OpeningStatusState,
  OpeningError,
  StatusHistoryEntry,
} from '../types';
import { allowedTransitionsFor, findRule, TRANSITIONS } from './statusMachine';
import { ChangeStatusInput } from '../validators/status.validator';

export interface StatusContext {
  /** The caller holds `opening.manage` — unlocks reopen/undo transitions. */
  canManage: boolean;
}

// ─── Shared helper, also used by the approval engine ────────────────────────

/**
 * Append a status change made by another phase (Phase 2 approvals, Phase 4
 * automation) to the same timeline, so an opening has one history rather than
 * several. The caller has already performed the status UPDATE.
 */
export async function recordStatusChange(
  client: TenantClient,
  data: statusRepo.HistoryData
): Promise<void> {
  await statusRepo.appendHistory(client, data);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

async function requireOpening(client: TenantClient, id: string): Promise<Opening> {
  const opening = await openingRepo.findById(client, id);
  if (!opening) throw OpeningError.notFound('Opening');
  return opening;
}

export async function getStatusState(
  actor: Actor,
  openingId: string,
  ctx: StatusContext
): Promise<OpeningStatusState> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    const history = await statusRepo.findHistory(client, openingId);
    return buildState(opening, history, ctx);
  });
}

function buildState(
  opening: Opening,
  history: StatusHistoryEntry[],
  ctx: StatusContext
): OpeningStatusState {
  return {
    openingId: opening.id,
    openingCode: opening.openingCode,
    status: opening.status,
    statusReason: opening.statusReason,
    statusNote: opening.statusNote,
    statusChangedAt: opening.statusChangedAt,
    closedAt: opening.closedAt,
    allowedTransitions: allowedTransitionsFor(opening.status, ctx.canManage),
    history,
  };
}

export async function getHistory(
  actor: Actor,
  openingId: string
): Promise<StatusHistoryEntry[]> {
  return withTenant(actor.tenantId, async (client) => {
    await requireOpening(client, openingId);
    return statusRepo.findHistory(client, openingId);
  });
}

/** Tenant-wide counts per status — the pipeline board header. */
export async function getStatusSummary(
  actor: Actor,
  archived: 'exclude' | 'include' | 'only' = 'exclude'
): Promise<Record<string, number>> {
  return withTenant(actor.tenantId, (client) => statusRepo.countByStatus(client, archived));
}

/**
 * The whole lifecycle as data, for a UI that wants to render the board without
 * hard-coding the rules. Not opening-specific.
 */
export function getStatusCatalog(): Record<string, unknown> {
  return {
    statuses: Object.keys(TRANSITIONS),
    transitions: TRANSITIONS,
  };
}

// ─── Transition ─────────────────────────────────────────────────────────────

export async function changeStatus(
  actor: Actor,
  openingId: string,
  input: ChangeStatusInput,
  ctx: StatusContext
): Promise<OpeningStatusState> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    const to = input.status as OpeningStatus;

    if (opening.status === to) {
      throw OpeningError.badRequest(`The opening is already "${to}"`);
    }

    const rule = findRule(opening.status, to);
    if (!rule) {
      const options = allowedTransitionsFor(opening.status, ctx.canManage)
        .map((t) => t.to)
        .join(', ');
      throw OpeningError.badRequest(
        `Cannot move an opening from "${opening.status}" to "${to}"` +
          (options ? ` — allowed: ${options}` : '')
      );
    }

    // Approval moves have their own endpoints, with their own rules.
    if (rule.ownedBy === 'approval') {
      throw OpeningError.badRequest(
        `"${to}" is reached through the approval endpoints (submit / approve / reject / withdraw), not a status change`
      );
    }

    if (rule.requiresManage && !ctx.canManage) {
      throw OpeningError.forbidden(`Moving to "${to}" requires the opening.manage permission`);
    }

    if (rule.requiresNote && !input.note) {
      throw OpeningError.badRequest(`Moving to "${to}" requires a note explaining why`);
    }

    return applyTransition(client, opening, to, {
      reason: input.reason ?? to,
      note: input.note ?? null,
      actor,
      ctx,
    });
  });
}

/**
 * Put an opening on hold. Sugar over changeStatus, kept as its own endpoint
 * because "hold" is a distinct action in the UI and always needs a reason.
 */
export async function hold(
  actor: Actor,
  openingId: string,
  note: string,
  ctx: StatusContext
): Promise<OpeningStatusState> {
  return changeStatus(actor, openingId, { status: 'on_hold', reason: 'on_hold', note }, ctx);
}

/**
 * Resume from hold, returning to whatever the opening was doing before — read
 * from the timeline rather than a denormalised column, so it stays correct even
 * after repeated hold/resume cycles.
 */
export async function resume(
  actor: Actor,
  openingId: string,
  note: string | null,
  ctx: StatusContext
): Promise<OpeningStatusState> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    if (opening.status !== 'on_hold') {
      throw OpeningError.badRequest(`The opening is not on hold (status "${opening.status}")`);
    }

    const previous = await statusRepo.findStatusBeforeHold(client, openingId);
    // Falling back to 'approved' keeps resume working for openings held before
    // this table existed; it is the earliest status a hold can be resumed to.
    const target: OpeningStatus = previous ?? 'approved';

    if (!findRule('on_hold', target)) {
      throw OpeningError.badRequest(
        `Cannot resume to "${target}" — set the status explicitly instead`
      );
    }

    return applyTransition(client, opening, target, {
      reason: 'resumed',
      note,
      actor,
      ctx,
    });
  });
}

// ─── The write path ─────────────────────────────────────────────────────────

/**
 * Move an opening, enforcing the transition map, inside a transaction the caller
 * already owns. Phase 4's posting service goes through here so posting and
 * status can never disagree about what is legal.
 *
 * The caller is responsible for permission checks; this only validates the move
 * itself. `isAutomated` marks the history row as machine-made.
 */
export async function performTransition(
  client: TenantClient,
  opening: Opening,
  to: OpeningStatus,
  opts: {
    reason: string;
    note: string | null;
    actorId: string;
    isAutomated?: boolean;
  }
): Promise<Opening> {
  if (!findRule(opening.status, to)) {
    throw OpeningError.badRequest(
      `Cannot move an opening from "${opening.status}" to "${to}"`
    );
  }

  const moved = await statusRepo.transition(client, opening.id, opening.status, to, {
    reason: opts.reason,
    note: opts.note,
    changedBy: opts.actorId,
  });
  if (!moved) {
    throw OpeningError.conflict(
      'The opening status changed while this request was in flight — reload and try again'
    );
  }

  await statusRepo.appendHistory(client, {
    openingId: opening.id,
    fromStatus: opening.status,
    toStatus: to,
    reason: opts.reason,
    note: opts.note,
    isAutomated: opts.isAutomated ?? false,
    changedBy: opts.actorId,
  });

  const updated = await openingRepo.findById(client, opening.id);
  if (!updated) throw OpeningError.notFound('Opening');
  return updated;
}

async function applyTransition(
  client: TenantClient,
  opening: Opening,
  to: OpeningStatus,
  opts: { reason: string; note: string | null; actor: Actor; ctx: StatusContext }
): Promise<OpeningStatusState> {
  const updated = await performTransition(client, opening, to, {
    reason: opts.reason,
    note: opts.note,
    actorId: opts.actor.userId,
  });

  await runSideEffects(client, opening, to, opts);

  const history = await statusRepo.findHistory(client, opening.id);
  return buildState(updated, history, opts.ctx);
}

/**
 * Consequences a transition has elsewhere in the module.
 *
 * Cancelling mid-review is the important one: the approval steps are still
 * pending and would otherwise sit in approvers' queues forever. The queue query
 * filters on the opening's status, so they would not actually be *shown* — but
 * leaving them 'pending' would misreport the trail, so close them explicitly.
 */
async function runSideEffects(
  client: TenantClient,
  opening: Opening,
  to: OpeningStatus,
  opts: { note: string | null; actor: Actor }
): Promise<void> {
  if (opening.status === 'pending_approval' && to === 'cancelled') {
    await approvalRepo.closeRemaining(
      client,
      opening.id,
      opening.approvalRound,
      'cancelled',
      opts.actor.userId,
      opts.note ?? 'Opening cancelled'
    );
  }

  // Recruitment is over — take the job ads down (Phase 4). Doing this here
  // rather than in the posting service means it holds no matter which endpoint
  // drove the move.
  if (to === 'filled' || to === 'closed' || to === 'cancelled') {
    await postingRepo.closeAllActive(client, opening.id, `Opening ${to}`);
  }
}
