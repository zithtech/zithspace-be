// src/modules/qa-playbooks/controllers/collection.controller.ts
//
// Collections — curated, ordered bundles of playbooks. Migration 005 explains
// the model; this file is the authority layer over it.
//
// AUTHORITY, in one sentence, and it is the same sentence playbooks get: a
// tenant curates collections for ITSELF; only a super_admin curates the platform
// library, and only the library may be 'public' or 'premium'.
//
// That split is what lets both exist on one surface. "Fintech & Payments" is a
// claim about what an entire industry should test, published to every tenant —
// platform authority. "Our Q3 regression pack" is a team's own reading list,
// invisible to everyone else — the same authority as writing a test case.
// resolveOwnership below decides which one a write is, from WHO IS ASKING
// rather than from anything in the request body.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { actorOf, handle, isSuperAdmin, ok, PlaybookError } from '../http';
import * as repo from '../repositories/collection.repo';
import {
  collectionMembersSchema,
  collectionMetaSchema,
  collectionPinsSchema,
  decisionSchema,
  publishSchema,
  unlockRequestSchema,
} from '../validators';
import { COLLECTION_KINDS, COLLECTION_KIND_HINTS, COLLECTION_KIND_LABELS } from '../constants';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

/* ── Reading ─────────────────────────────────────────────────────────────── */

/** GET /api/v2/qa/playbooks/collections — the shelf. */
export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  // Drafts are a curator's work in progress; a tenant is never offered one.
  const includeAll = isSuperAdmin(req) && req.query.all === 'true';

  const { collections, industries } = await withTenant(tenantId, async (client) => ({
    collections: await repo.listCollections(client, {
      kind,
      search: search || undefined,
      includeAll,
    }),
    industries: await repo.listIndustries(client, { includeAll }),
  }));

  ok(res, {
    collections,
    industries,
    kinds: COLLECTION_KINDS.map((value) => ({
      value,
      label: COLLECTION_KIND_LABELS[value],
      hint: COLLECTION_KIND_HINTS[value],
    })),
    canCurate: isSuperAdmin(req),
  });
});

/** GET /api/v2/qa/playbooks/collections/:slug — one pack, in reading order. */
export const detail = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw new PlaybookError('A collection slug is required', 400);

  const collection = await withTenant(tenantId, (client) =>
    repo.getCollectionBySlug(client, slug, { includeAll: isSuperAdmin(req) })
  );
  if (!collection) throw new PlaybookError('Collection not found', 404, 'NOT_FOUND');

  ok(res, { ...collection, canCurate: isSuperAdmin(req) });
});

/* ── Curating ────────────────────────────────────────────────────────────── */

/**
 * Who owns what a write creates, and what tier it may carry.
 *
 * Mirrors resolveOwnership in playbook.controller.ts exactly. A super_admin
 * authors the library (tenant_id NULL, public or premium); everyone else
 * authors for their own workspace and the tier is forced to 'workspace' — the
 * request body cannot talk them out of it, and the CHECK constraint in
 * migration 005 would refuse it anyway.
 */
function resolveOwnership(req: AuthRequest, requested: string) {
  if (isSuperAdmin(req)) {
    const visibility = requested === 'workspace' ? 'public' : requested;
    return { ownerTenantId: null as string | null, visibility };
  }
  return { ownerTenantId: actorOf(req).tenantId as string | null, visibility: 'workspace' };
}

/** Refuse the write unless this caller owns the row. */
function assertCanCurate(req: AuthRequest, owner: { tenantId: string | null }) {
  if (isSuperAdmin(req)) return;
  const { tenantId } = actorOf(req);
  if (owner.tenantId === null) {
    throw new PlaybookError('Only Testiez can edit a library collection', 403, 'FORBIDDEN');
  }
  // Someone else's private collection is not "forbidden", it is not there.
  if (owner.tenantId !== tenantId) {
    throw new PlaybookError('Collection not found', 404, 'NOT_FOUND');
  }
}

/** POST /api/v2/qa/playbooks/collections */
export const create = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = collectionMetaSchema.parse(req.body ?? {});
  const { ownerTenantId, visibility } = resolveOwnership(req, body.visibility);

  const created = await withTenant(tenantId, (client) =>
    repo.createCollection(client, {
      ownerTenantId,
      createdBy: userId ?? null,
      name: body.name,
      kind: body.kind,
      industry: body.industry?.trim() || null,
      summary: body.summary ?? null,
      description: body.description ?? null,
      icon: body.icon ?? null,
      visibility: visibility as any,
      priceCredits: body.price_credits ?? null,
      priceAmount: body.price_amount ?? null,
      priceCurrency: body.price_currency,
      sortOrder: body.sort_order,
    })
  );

  recordTransaction({
    req: req as any,
    section: Section.WORK,
    module: Module.QA_WORKSPACE,
    page: Page.QA_CASE_LIST,
    action: Action.CREATE,
    actionLabel: `Playbook collection created (${body.kind})`,
    entityType: EntityType.QA_CASE,
    entityId: created.id,
    entityLabel: body.name,
    afterData: { slug: created.slug, kind: body.kind, visibility },
  });

  ok(res, { id: created.id, slug: created.slug, visibility }, 201);
});

/** PUT /api/v2/qa/playbooks/collections/:id */
export const update = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const body = collectionMetaSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, async (client) => {
    const owner = await repo.getCollectionOwnership(client, id);
    if (!owner) throw new PlaybookError('Collection not found', 404, 'NOT_FOUND');
    assertCanCurate(req, owner);

    // Ownership never changes on edit, so the tier follows who owns it now
    // rather than who is asking.
    const visibility =
      owner.tenantId === null
        ? body.visibility === 'workspace'
          ? 'public'
          : body.visibility
        : 'workspace';

    return repo.updateCollection(client, id, {
      name: body.name,
      kind: body.kind,
      industry: body.industry?.trim() || null,
      summary: body.summary ?? null,
      description: body.description ?? null,
      icon: body.icon ?? null,
      visibility: visibility as any,
      priceCredits: body.price_credits ?? null,
      priceAmount: body.price_amount ?? null,
      priceCurrency: body.price_currency,
      sortOrder: body.sort_order,
      updatedBy: userId ?? null,
    });
  });

  ok(res, result);
});

/**
 * PUT /api/v2/qa/playbooks/collections/:id/playbooks
 *
 * Maps existing playbooks into the collection, IN ORDER. The whole membership
 * arrives at once and position is the array index — see collectionMembersSchema
 * for why order is not a client-supplied field.
 *
 * Ids the collection may not hold are dropped rather than failing the call, and
 * the response says how many and which: a curator who pasted a list including
 * one archived playbook should get the other forty saved, plus a line telling
 * them what did not go in.
 */
export const setPlaybooks = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const body = collectionMembersSchema.parse(req.body ?? {});

  // A playbook listed twice is a curation slip, and the unique index would
  // reject the whole batch for it. First mention wins, and the count in the
  // response tells the curator something was collapsed.
  const seen = new Set<string>();
  const requested = body.playbooks.filter((p) => {
    if (seen.has(p.playbook_id)) return false;
    seen.add(p.playbook_id);
    return true;
  });

  const result = await withTenant(tenantId, async (client) => {
    const owner = await repo.getCollectionOwnership(client, id);
    if (!owner) throw new PlaybookError('Collection not found', 404, 'NOT_FOUND');
    assertCanCurate(req, owner);

    const allowedIds = await repo.filterAssignablePlaybooks(
      client,
      owner.tenantId,
      requested.map((p) => p.playbook_id)
    );
    const allowed = new Set(allowedIds);
    const members = requested
      .filter((p) => allowed.has(p.playbook_id))
      .map((p) => ({ playbookId: p.playbook_id, note: p.note ?? null }));

    const { playbookCount } = await repo.replaceMembers(client, id, members, userId ?? null);

    return {
      id,
      slug: owner.slug,
      playbookCount,
      rejected: requested
        .map((p) => p.playbook_id)
        .filter((pid) => !allowed.has(pid)),
    };
  });

  recordTransaction({
    req: req as any,
    section: Section.WORK,
    module: Module.QA_WORKSPACE,
    page: Page.QA_CASE_LIST,
    action: Action.UPDATE,
    actionLabel: `Collection membership set (${result.playbookCount} playbooks)`,
    entityType: EntityType.QA_CASE,
    entityId: id,
    entityLabel: result.slug,
    afterData: { playbookCount: result.playbookCount },
  });

  ok(res, result);
});

/**
 * POST /api/v2/qa/playbooks/collections/:id/playbooks/:playbookId
 *
 * Files one playbook into a pack, at the end of its order. What the author flow
 * calls after creating a playbook they said belonged in a collection.
 *
 * Same authority as curating the pack, because that is what it is — you may add
 * to a collection you could edit. The playbook must also be one the collection
 * may legitimately hold: a library pack takes library playbooks only, which is
 * the rule filterAssignablePlaybooks exists to enforce.
 */
export const addPlaybook = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const playbookId = String(req.params.playbookId);

  const result = await withTenant(tenantId, async (client) => {
    const owner = await repo.getCollectionOwnership(client, id);
    if (!owner) throw new PlaybookError('Collection not found', 404, 'NOT_FOUND');
    assertCanCurate(req, owner);

    const allowed = await repo.filterAssignablePlaybooks(client, owner.tenantId, [playbookId]);
    if (allowed.length === 0) {
      throw new PlaybookError(
        'That playbook cannot go in this collection',
        400,
        'NOT_ASSIGNABLE'
      );
    }

    return repo.addMember(client, id, playbookId, userId ?? null);
  });

  ok(res, { collectionId: id, playbookId, ...result });
});

/** POST /api/v2/qa/playbooks/collections/:id/status */
export const setStatus = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const { status } = publishSchema.parse(req.body ?? {});

  await withTenant(tenantId, async (client) => {
    const owner = await repo.getCollectionOwnership(client, id);
    if (!owner) throw new PlaybookError('Collection not found', 404, 'NOT_FOUND');
    assertCanCurate(req, owner);

    // Publishing a pack to every tenant is a platform act, not a tenant one.
    if (owner.tenantId === null && !isSuperAdmin(req)) {
      throw new PlaybookError('Only Testiez can publish a library collection', 403, 'FORBIDDEN');
    }

    // An empty pack published is a dead end for whoever opens it, and the
    // shelf is the first thing a new customer sees.
    if (status === 'published') {
      const members = await repo.listMembers(client, id, { includeAll: true });
      if (members.length === 0) {
        throw new PlaybookError(
          'Add at least one playbook before publishing this collection',
          400,
          'EMPTY_COLLECTION'
        );
      }
    }

    await repo.setCollectionStatus(client, id, status, userId ?? null);
  });

  ok(res, { id, status });
});

/** DELETE /api/v2/qa/playbooks/collections/:id */
export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const superAdmin = isSuperAdmin(req);

  const result = await withTenant(tenantId, async (client) => {
    const owner = await repo.getCollectionOwnership(client, id);
    if (!owner) throw new PlaybookError('Collection not found', 404, 'NOT_FOUND');
    if (owner.tenantId === null && !superAdmin) {
      throw new PlaybookError('Global library collections cannot be deleted', 403, 'FORBIDDEN');
    }
    assertCanCurate(req, owner);
    return repo.softDeleteCollection(client, id, userId, superAdmin);
  });

  ok(res, { id, name: result.name, deleted: true });
});

/** POST /api/v2/qa/playbooks/trash/collections/:id/restore */
export const restoreCollection = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const id = String(req.params.id);
  const superAdmin = isSuperAdmin(req);

  const restored = await withTenant(tenantId, async (client) => {
    return repo.restoreCollection(client, id, superAdmin);
  });

  ok(res, { id, name: restored.name, restored: true });
});

/** DELETE /api/v2/qa/playbooks/trash/collections/:id/permanent */
export const permanentDeleteCollection = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const id = String(req.params.id);
  const superAdmin = isSuperAdmin(req);

  await withTenant(tenantId, async (client) => {
    await repo.permanentDeleteCollection(client, id, superAdmin);
  });

  ok(res, { id, permanentlyDeleted: true });
});

/* ── "What do you build?" ────────────────────────────────────────────────── */

/**
 * PUT /api/v2/qa/playbooks/collections/pins
 *
 * The workspace's own answer, in its own order. Not an access rule and not a
 * filter: it sorts the shelf so the packs a team said were theirs come first,
 * and every other collection stays one click away for the day they add a
 * storefront to the lending app.
 *
 * Any member with playbook read access may set it — it is a note the workspace
 * makes about itself, not a permission grant, and putting it behind an admin
 * would mean the person who actually opens the library cannot answer it.
 */
export const setPins = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = collectionPinsSchema.parse(req.body ?? {});

  // Pinning the same pack twice is a click, not two pins.
  const unique = [...new Set(body.collections)];

  const result = await withTenant(tenantId, (client) =>
    repo.replacePins(client, unique, userId ?? null)
  );

  ok(res, result);
});

/* ── Buying a pack ───────────────────────────────────────────────────────── */

/**
 * POST /api/v2/qa/playbooks/collections/:slug/unlock-request
 *
 * Asking needs read access only. The QA who opened a premium pack and wants it
 * is exactly the person worth hearing from, and making them find an admin first
 * loses the ask.
 */
export const requestUnlock = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const slug = String(req.params.slug || '').trim();
  const body = unlockRequestSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, async (client) => {
    const collection = await repo.getCollectionBySlug(client, slug);
    if (!collection) throw new PlaybookError('Collection not found', 404, 'NOT_FOUND');
    if (!collection.locked) {
      throw new PlaybookError(
        'This collection is already available to your workspace',
        400,
        'ALREADY_UNLOCKED'
      );
    }
    return repo.createCollectionUnlockRequest(
      client,
      collection.id,
      userId ?? null,
      body.message ?? null
    );
  });

  ok(res, result, result.created ? 201 : 200);
});

/** GET /api/v2/qa/playbooks/collections/admin/unlock-requests — the platform queue. */
export const listUnlockRequests = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const raw = typeof req.query.status === 'string' ? req.query.status : undefined;
  // The queue's pills include "all", which is the absence of a filter rather
  // than a status any row can hold.
  const status = raw && raw !== 'all' ? raw : undefined;

  const requests = await withTenant(tenantId, (client) =>
    repo.listCollectionUnlockRequests(client, status)
  );

  ok(res, { requests });
});

/** POST /api/v2/qa/playbooks/collections/admin/unlock-requests/:id */
export const decideUnlockRequest = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const body = decisionSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, (client) =>
    repo.decideCollectionUnlockRequest(
      client,
      id,
      body.decision,
      userId ?? null,
      body.note ?? null
    )
  );
  if (!result) {
    throw new PlaybookError('That request has already been decided', 409, 'ALREADY_DECIDED');
  }

  recordTransaction({
    req: req as any,
    section: Section.WORK,
    module: Module.QA_WORKSPACE,
    page: Page.QA_CASE_LIST,
    action: Action.UPDATE,
    actionLabel: `Collection access ${body.decision}`,
    entityType: EntityType.QA_CASE,
    entityId: id,
    entityLabel: id,
    afterData: { decision: body.decision },
  });

  ok(res, result);
});
