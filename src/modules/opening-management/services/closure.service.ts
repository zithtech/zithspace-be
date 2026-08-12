// src/modules/opening-management/services/closure.service.ts
//
// Phase 7 — closing an opening and archiving it.
//
//   all positions filled ─▶ close with a reason ─▶ auto-archive
//
// The closure REASON decides the terminal status, rather than the caller
// choosing both and risking "closed because cancelled":
//
//   position_filled                                        → closed
//   cancelled | budget_issue | client_cancelled |
//   duplicate_opening                                      → cancelled
//
// The move itself goes through the Phase 3 state machine, so an illegal close
// (a draft "closed because position filled") is refused with the same message
// as any other bad transition.

import { TenantClient, withTenant } from '../db/pool';
import * as openingRepo from '../repositories/opening.repo';
import * as applicationRepo from '../repositories/application.repo';
import * as postingRepo from '../repositories/posting.repo';
import { performTransition } from './status.service';
import {
  Actor,
  ClosureCandidate,
  ClosureReason,
  ClosureResult,
  Opening,
  OpeningError,
  OpeningStatus,
} from '../types';
import { ArchiveInput, CloseOpeningInput } from '../validators/closure.validator';

/** Reason → the terminal status it implies. */
const REASON_STATUS: Record<ClosureReason, OpeningStatus> = {
  position_filled: 'closed',
  cancelled: 'cancelled',
  budget_issue: 'cancelled',
  client_cancelled: 'cancelled',
  duplicate_opening: 'cancelled',
};

export const CLOSURE_REASONS: {
  value: ClosureReason;
  label: string;
  status: OpeningStatus;
  requiresDuplicateLink?: boolean;
}[] = [
  { value: 'position_filled', label: 'Position Filled', status: 'closed' },
  { value: 'cancelled', label: 'Cancelled', status: 'cancelled' },
  { value: 'budget_issue', label: 'Budget Issue', status: 'cancelled' },
  { value: 'client_cancelled', label: 'Client Cancelled', status: 'cancelled' },
  {
    value: 'duplicate_opening',
    label: 'Duplicate Opening',
    status: 'cancelled',
    requiresDuplicateLink: true,
  },
];

async function requireOpening(client: TenantClient, id: string): Promise<Opening> {
  const opening = await openingRepo.findById(client, id);
  if (!opening) throw OpeningError.notFound('Opening');
  return opening;
}

// ─── Close ──────────────────────────────────────────────────────────────────

export async function closeOpening(
  actor: Actor,
  openingId: string,
  input: CloseOpeningInput
): Promise<ClosureResult> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);

    if (opening.closureReason) {
      throw OpeningError.conflict(
        `This opening was already closed as "${opening.closureReason}"`
      );
    }

    const reason = input.closureReason as ClosureReason;
    const targetStatus = REASON_STATUS[reason];

    if (reason === 'duplicate_opening') {
      await assertDuplicateTarget(client, openingId, input.duplicateOfOpeningId as string);
    }

    // Counted before the close, so the result reports who was actually left in
    // the pipeline at the moment recruitment stopped.
    const openApplications = await applicationRepo.countOpen(client, openingId);

    let applicationsRejected = 0;
    if (input.rejectRemaining && openApplications > 0) {
      applicationsRejected = await applicationRepo.rejectAllOpen(
        client,
        openingId,
        input.note ?? `Opening closed — ${reason}`,
        actor.userId
      );
    }

    // The state machine owns legality; it also takes live postings down as a
    // side effect of reaching a terminal status (Phase 3 → Phase 4 wiring).
    const postingsBefore = (await postingRepo.findByOpening(client, openingId)).filter(
      (p) => p.status === 'active'
    ).length;

    await performTransition(client, opening, targetStatus, {
      reason: reason,
      note: input.note ?? null,
      actorId: actor.userId,
    });

    const stamped = await openingRepo.recordClosure(client, openingId, {
      closureReason: reason,
      closureNote: input.note ?? null,
      duplicateOfOpeningId:
        reason === 'duplicate_opening' ? (input.duplicateOfOpeningId as string) : null,
      // The spec's "automatically archive" — opt out with archive: false.
      archive: input.archive ?? true,
      closedBy: actor.userId,
    });
    if (!stamped) {
      throw OpeningError.conflict('This opening was closed by someone else while you were closing it');
    }

    const updated = await requireOpening(client, openingId);
    return {
      opening: updated,
      status: updated.status,
      archived: updated.isArchived,
      postingsClosed: postingsBefore,
      openApplications,
      applicationsRejected,
    };
  });
}

/** The duplicate target must be a different, real opening in the same tenant. */
async function assertDuplicateTarget(
  client: TenantClient,
  openingId: string,
  duplicateOfOpeningId: string
): Promise<void> {
  if (duplicateOfOpeningId === openingId) {
    throw OpeningError.badRequest('An opening cannot be a duplicate of itself');
  }
  const target = await openingRepo.findById(client, duplicateOfOpeningId);
  if (!target) {
    throw OpeningError.badRequest('The opening this duplicates was not found for this tenant');
  }
}

// ─── Archive ────────────────────────────────────────────────────────────────

/**
 * Archive an opening that was closed without archiving. Only finished work can
 * be archived — archiving something still being recruited for would hide it
 * from the people working on it.
 */
export async function archiveOpening(
  actor: Actor,
  openingId: string,
  _input: ArchiveInput
): Promise<Opening> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    if (!['closed', 'cancelled', 'filled'].includes(opening.status)) {
      throw OpeningError.badRequest(
        `Only a closed, cancelled or filled opening can be archived (this one is "${opening.status}")`
      );
    }
    if (opening.isArchived) {
      throw OpeningError.badRequest('This opening is already archived');
    }

    const ok = await openingRepo.setArchived(client, openingId, true, actor.userId);
    if (!ok) throw OpeningError.conflict('The opening changed while it was being archived');
    return requireOpening(client, openingId);
  });
}

/** Bring an opening back out of the archive. Does NOT reopen it — see Phase 3. */
export async function unarchiveOpening(actor: Actor, openingId: string): Promise<Opening> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    if (!opening.isArchived) {
      throw OpeningError.badRequest('This opening is not archived');
    }

    const ok = await openingRepo.setArchived(client, openingId, false, actor.userId);
    if (!ok) throw OpeningError.conflict('The opening changed while it was being un-archived');
    return requireOpening(client, openingId);
  });
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Openings that have met their hiring target but are still open — the queue the
 * spec's "when all positions are filled" refers to.
 *
 * Surfacing them rather than closing them automatically is deliberate: closing
 * is a decision with consequences for candidates still in the pipeline, and a
 * background job making it silently would be a nasty surprise.
 */
export async function listClosureCandidates(actor: Actor): Promise<ClosureCandidate[]> {
  return withTenant(actor.tenantId, (client) => openingRepo.findClosureCandidates(client));
}

export function getClosureReasons() {
  return CLOSURE_REASONS;
}
