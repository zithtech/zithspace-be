// src/modules/opening-management/services/posting.service.ts
//
// Phase 4 — the posting lifecycle:
//
//   approved ─▶ internal posting (N days) ─▶ auto-move ─▶ external posting
//
// Posting an opening is a status transition plus a posting record, always in one
// transaction. The transition itself goes through status.service.performTransition
// so the state machine stays the single authority on what is legal — this file
// decides *when* to post, never *whether the move is allowed*.

import { TenantClient, withTenant } from '../db/pool';
import * as openingRepo from '../repositories/opening.repo';
import * as postingRepo from '../repositories/posting.repo';
import { performTransition } from './status.service';
import {
  Actor,
  AutoMoveResult,
  Opening,
  OpeningError,
  OpeningPosting,
  PostingSettings,
  PostingType,
} from '../types';
import { PostInternalInput, UpdatePostingSettingsInput } from '../validators/posting.validator';

/** The user id recorded for moves nobody made by hand. */
const SYSTEM_ACTOR = null;

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getSettings(actor: Actor): Promise<PostingSettings> {
  return withTenant(actor.tenantId, (client) => postingRepo.findSettings(client));
}

export async function updateSettings(
  actor: Actor,
  input: UpdatePostingSettingsInput
): Promise<PostingSettings> {
  return withTenant(actor.tenantId, (client) =>
    postingRepo.upsertSettings(
      client,
      {
        internalPostingDays: input.internalPostingDays ?? undefined,
        autoMoveToExternal: input.autoMoveToExternal ?? undefined,
      },
      actor.userId
    )
  );
}

// ─── Reads ──────────────────────────────────────────────────────────────────

async function requireOpening(client: TenantClient, id: string): Promise<Opening> {
  const opening = await openingRepo.findById(client, id);
  if (!opening) throw OpeningError.notFound('Opening');
  return opening;
}

export async function listPostings(
  actor: Actor,
  openingId: string
): Promise<OpeningPosting[]> {
  return withTenant(actor.tenantId, async (client) => {
    await requireOpening(client, openingId);
    return postingRepo.findByOpening(client, openingId);
  });
}

// ─── Posting ────────────────────────────────────────────────────────────────

export interface PostingResult {
  opening: Opening;
  posting: OpeningPosting;
  postings: OpeningPosting[];
}

/**
 * Publish to the internal job board (IJP) for a fixed window.
 *
 * The window length and auto-move flag are captured on the posting row at this
 * moment, so changing the tenant defaults later cannot alter work already live.
 */
export async function postInternally(
  actor: Actor,
  openingId: string,
  input: PostInternalInput
): Promise<PostingResult> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);

    if (opening.visibility === 'external_only') {
      throw OpeningError.badRequest(
        'This opening is marked external-only — change its visibility to post it internally'
      );
    }
    if (await postingRepo.findActive(client, openingId, 'internal')) {
      throw OpeningError.conflict('This opening already has a live internal posting');
    }

    const settings = await postingRepo.findSettings(client);
    const days = input.days ?? settings.internalPostingDays;
    const autoMove = input.autoMove ?? settings.autoMoveToExternal;
    const expiresAt = addDays(new Date(), days);

    const updated = await performTransition(client, opening, 'internal_posting', {
      reason: 'posted_internally',
      note: input.note ?? `Internal posting for ${days} day(s)`,
      actorId: actor.userId,
    });

    const posting = await postingRepo.insertPosting(client, {
      openingId,
      postingType: 'internal',
      expiresAt,
      autoMove,
      postedBy: actor.userId,
      isAutomated: false,
    });
    await postingRepo.stampOpeningPosting(client, openingId, {
      postingType: 'internal',
      internalPostingEndsAt: expiresAt,
    });

    return {
      opening: updated,
      posting,
      postings: await postingRepo.findByOpening(client, openingId),
    };
  });
}

/**
 * Publish externally. When an internal posting is still live it is closed as
 * `expired` and marked `moved` — the same handover the scheduled sweep performs,
 * just triggered by a person.
 */
export async function postExternally(
  actor: Actor,
  openingId: string,
  note: string | null
): Promise<PostingResult> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);

    if (opening.visibility === 'internal_only') {
      throw OpeningError.badRequest(
        'This opening is marked internal-only — change its visibility to post it externally'
      );
    }
    if (await postingRepo.findActive(client, openingId, 'external')) {
      throw OpeningError.conflict('This opening already has a live external posting');
    }

    const posting = await moveToExternal(client, opening, {
      actorId: actor.userId,
      note,
      isAutomated: false,
      reason: 'posted_externally',
    });

    return {
      opening: await requireOpening(client, openingId),
      posting,
      postings: await postingRepo.findByOpening(client, openingId),
    };
  });
}

/**
 * The internal → external handover. Shared by the manual endpoint and the
 * scheduled sweep so both produce identical records.
 */
async function moveToExternal(
  client: TenantClient,
  opening: Opening,
  opts: { actorId: string | null; note: string | null; isAutomated: boolean; reason: string }
): Promise<OpeningPosting> {
  const live = await postingRepo.findActive(client, opening.id, 'internal');
  if (live) {
    const closed = await postingRepo.closePosting(client, live.id, {
      status: 'expired',
      reason: opts.isAutomated
        ? 'Internal window elapsed — moved to external posting'
        : 'Superseded by external posting',
      moved: true,
      isAutomated: opts.isAutomated,
    });
    // Lost the race against the sweep (or another request); it already moved.
    if (!closed) {
      throw OpeningError.conflict('This posting was just moved by another process');
    }
  }

  await performTransition(client, opening, 'external_posting', {
    reason: opts.reason,
    note: opts.note,
    actorId: opts.actorId as string,
    isAutomated: opts.isAutomated,
  });

  const posting = await postingRepo.insertPosting(client, {
    openingId: opening.id,
    postingType: 'external',
    expiresAt: null,
    autoMove: false,
    postedBy: opts.actorId as string,
    isAutomated: opts.isAutomated,
  });
  await postingRepo.stampOpeningPosting(client, opening.id, {
    postingType: 'external',
    internalPostingEndsAt: null,
  });
  return posting;
}

/**
 * Take a posting down without ending recruitment. The opening's status is left
 * alone — use the Phase 3 endpoints for that.
 */
export async function closePosting(
  actor: Actor,
  openingId: string,
  postingId: string,
  reason: string | null
): Promise<OpeningPosting[]> {
  return withTenant(actor.tenantId, async (client) => {
    await requireOpening(client, openingId);
    const posting = await postingRepo.findById(client, postingId);
    if (!posting || posting.openingId !== openingId) {
      throw OpeningError.notFound('Posting');
    }
    if (posting.status !== 'active') {
      throw OpeningError.badRequest(`This posting is already "${posting.status}"`);
    }

    const closed = await postingRepo.closePosting(client, postingId, {
      status: 'closed',
      reason,
      moved: false,
      isAutomated: false,
    });
    if (!closed) throw OpeningError.conflict('That posting was just closed by someone else');

    if (posting.postingType === 'internal') {
      // The window is gone; clear the denormalised copy so list views stop
      // showing a countdown for a posting that no longer exists.
      await client.query(
        `UPDATE om_openings SET internal_posting_ends_at = NULL WHERE tenant_id = $1 AND id = $2`,
        [client.tenantId, openingId]
      );
    }

    return postingRepo.findByOpening(client, openingId);
  });
}

// ─── The scheduled sweep ────────────────────────────────────────────────────

/**
 * Move every internal posting whose window has elapsed to external posting.
 *
 * Runs with no tenant context, so it works in two stages: one cross-tenant read
 * for the due ids, then one `withTenant` transaction PER OPENING. Per-opening
 * (rather than per-tenant) transactions mean one bad row cannot roll back the
 * others, and a row that another process already handled simply fails its
 * compare-and-set and is skipped.
 *
 * Safe to run as often as you like — it is idempotent.
 */
export async function runAutoMoveSweep(limit = 500): Promise<AutoMoveResult> {
  const due = await postingRepo.findDueInternalPostings(limit);
  const result: AutoMoveResult = { scanned: due.length, moved: 0, failed: [] };

  for (const item of due) {
    try {
      await withTenant(item.tenantId, async (client) => {
        const opening = await openingRepo.findById(client, item.openingId);
        // Re-check inside the transaction: the read above was unsynchronised.
        if (!opening || opening.status !== 'internal_posting') return;

        // An internal-only opening must never be auto-published externally,
        // whatever the posting row says.
        if (opening.visibility === 'internal_only') {
          await postingRepo.closePosting(client, item.postingId, {
            status: 'expired',
            reason: 'Internal window elapsed — opening is internal-only, not moved',
            moved: false,
            isAutomated: true,
          });
          await client.query(
            `UPDATE om_openings SET internal_posting_ends_at = NULL WHERE tenant_id = $1 AND id = $2`,
            [client.tenantId, item.openingId]
          );
          return;
        }

        await moveToExternal(client, opening, {
          actorId: opening.updatedBy ?? opening.createdBy ?? SYSTEM_ACTOR,
          note: 'Internal posting window elapsed — moved automatically',
          isAutomated: true,
          reason: 'auto_moved_to_external',
        });
        result.moved += 1;
      });
    } catch (err: any) {
      result.failed.push({ openingId: item.openingId, error: err?.message ?? String(err) });
    }
  }

  return result;
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}
