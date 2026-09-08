// src/modules/qa-playbooks/controllers/playbook.controller.ts
//
// AUTHORITY, in one sentence: a tenant authors playbooks for itself; only a
// super_admin authors the platform library, and only the platform library may
// be 'public' or 'premium'. Every write below re-derives that rather than
// trusting a field in the request body.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { actorOf, handle, isSuperAdmin, listParam, ok, PlaybookError } from '../http';
import * as repo from '../repositories/playbook.repo';
import {
  contentSchema,
  decisionSchema,
  generateSchema,
  grantSchema,
  importSchema,
  playbookMetaSchema,
  playbookRequestDecisionSchema,
  playbookRequestSchema,
  publishSchema,
  unlockRequestSchema,
  zaiDraftSchema,
} from '../validators';
import { generateCasesFromItems } from '../services/generateCases';
import { draftRecommendation } from '../services/zaiRecommendation';
import {
  blocksToText,
  expandPlaybookOutline,
  extractDocumentText,
  outlinePlaybooksFromDocument,
} from '../services/zaiPlaybooksFromDocument';
// The platform's shared pg pool — Document Hub's own tables live outside this
// module's dedicated pool, and are read here with the query that owns them.
import pool from '@/config/dbpool';
import { entitlementService, EntitlementError } from '@/services/EntitlementService';
import { AIPricingEngine } from '@/ai/pricing/AIPricingEngine';
import { AIFeature } from '@/ai/types/AIFeature';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  LEVELS,
  LEVEL_LABELS,
  RISKS,
  VISIBILITIES,
  VISIBILITY_LABELS,
} from '../constants';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

/* ── Reading ─────────────────────────────────────────────────────────────── */

/** GET /api/v2/qa/playbooks — the catalog. */
export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const mine = req.query.mine === 'true';
  // Only a super_admin sees drafts and archived rows, and only when they ask.
  const includeAll = isSuperAdmin(req) && req.query.all === 'true';

  const data = await withTenant(tenantId, async (client) => {
    const [playbooks, categories] = await Promise.all([
      repo.listPlaybooks(client, { category, search: search || undefined, mine, includeAll }),
      repo.listCategories(client),
    ]);
    return { playbooks, categories, canPublish: isSuperAdmin(req) };
  });

  ok(res, data);
});

/** GET /api/v2/qa/playbooks/meta — the vocabularies the author form renders from. */
export const meta = handle(async (req: AuthRequest, res: Response) => {
  ok(res, {
    levels: LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] })),
    categories: CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
    risks: RISKS,
    visibilities: VISIBILITIES.map((value) => ({ value, label: VISIBILITY_LABELS[value] })),
    canPublish: isSuperAdmin(req),
  });
});

/** GET /api/v2/qa/playbooks/:slug — one playbook, or its locked preview. */
export const detail = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const slug = String(req.params.slug || '').trim();
  if (!slug) throw new PlaybookError('A playbook slug is required', 400);

  const playbook = await withTenant(tenantId, (client) =>
    repo.getPlaybookBySlug(client, slug, {
      levels: listParam(req.query.levels),
      categories: listParam(req.query.categories),
      includeAll: isSuperAdmin(req),
    })
  );
  if (!playbook) throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');

  ok(res, playbook);
});

/* ── Authoring ───────────────────────────────────────────────────────────── */

/**
 * Who owns what a write creates, and what tier it may carry.
 *
 * A super_admin authors the platform library (tenant_id NULL) and may publish
 * it public or premium. Everyone else authors for their own tenant, and the
 * tier is forced to 'workspace' — the request body cannot talk them out of it,
 * and the CHECK constraint in migration 002 would refuse it anyway.
 */
function resolveOwnership(req: AuthRequest, requested: string) {
  if (isSuperAdmin(req)) {
    const visibility = requested === 'workspace' ? 'public' : requested;
    return { ownerTenantId: null as string | null, visibility };
  }
  return { ownerTenantId: actorOf(req).tenantId as string | null, visibility: 'workspace' };
}

/** Refuse the write unless this caller owns the row. */
function assertCanEdit(req: AuthRequest, owner: { tenantId: string | null }) {
  const { tenantId } = actorOf(req);
  if (owner.tenantId === null) {
    if (!isSuperAdmin(req)) {
      throw new PlaybookError('Only Testiez can edit a library playbook', 403, 'FORBIDDEN');
    }
    return;
  }
  if (owner.tenantId !== tenantId) {
    throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');
  }
}

/** POST /api/v2/qa/playbooks */
export const create = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = playbookMetaSchema.parse(req.body ?? {});
  const { ownerTenantId, visibility } = resolveOwnership(req, body.visibility);

  const created = await withTenant(tenantId, (client) =>
    repo.createPlaybook(client, {
      ownerTenantId,
      createdBy: userId ?? null,
      name: body.name,
      category: body.category,
      summary: body.summary,
      overview: body.overview,
      version: body.version,
      visibility: visibility as any,
      priceCredits: body.price_credits ?? null,
      priceAmount: body.price_amount ?? null,
      priceCurrency: body.price_currency,
    })
  );

  recordTransaction({
    req: req as any,
    section: Section.WORK,
    module: Module.QA_WORKSPACE,
    page: Page.QA_CASE_LIST,
    action: Action.CREATE,
    actionLabel: `Playbook created (${visibility})`,
    entityType: EntityType.QA_CASE,
    entityId: created.id,
    entityLabel: body.name,
    afterData: { slug: created.slug, visibility },
  });

  ok(res, { id: created.id, slug: created.slug, visibility }, 201);
});

/** PUT /api/v2/qa/playbooks/:id */
export const update = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const body = playbookMetaSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, async (client) => {
    const owner = await repo.getOwnership(client, id);
    if (!owner) throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');
    assertCanEdit(req, owner);

    // Ownership never changes on edit, so the tier is constrained by who owns
    // it now — not by who is making the request.
    const visibility =
      owner.tenantId === null ? (body.visibility === 'workspace' ? 'public' : body.visibility) : 'workspace';

    return repo.updatePlaybookMeta(client, id, {
      name: body.name,
      category: body.category,
      summary: body.summary,
      overview: body.overview,
      version: body.version,
      visibility: visibility as any,
      priceCredits: body.price_credits ?? null,
      priceAmount: body.price_amount ?? null,
      priceCurrency: body.price_currency,
      updatedBy: userId ?? null,
    });
  });

  ok(res, result);
});

/** PUT /api/v2/qa/playbooks/:id/content — replaces the whole section tree. */
export const saveContent = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const body = contentSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, async (client) => {
    const owner = await repo.getOwnership(client, id);
    if (!owner) throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');
    assertCanEdit(req, owner);
    return repo.replaceContent(client, id, body, userId ?? null);
  });

  ok(res, result);
});

/** POST /api/v2/qa/playbooks/:id/status */
export const setStatus = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const { status } = publishSchema.parse(req.body ?? {});

  await withTenant(tenantId, async (client) => {
    const owner = await repo.getOwnership(client, id);
    if (!owner) throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');
    assertCanEdit(req, owner);

    // Publishing to every tenant is a platform act, not a tenant one.
    if (owner.tenantId === null && !isSuperAdmin(req)) {
      throw new PlaybookError('Only Testiez can publish a library playbook', 403, 'FORBIDDEN');
    }
    await repo.setStatus(client, id, status, userId ?? null);
  });

  ok(res, { id, status });
});

/** DELETE /api/v2/qa/playbooks/:id */
export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const id = String(req.params.id);

  await withTenant(tenantId, async (client) => {
    const owner = await repo.getOwnership(client, id);
    if (!owner) throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');
    assertCanEdit(req, owner);
    await repo.deletePlaybook(client, id);
  });

  ok(res, { id, deleted: true });
});

/**
 * POST /api/v2/qa/playbooks/import
 *
 * A batch of playbooks authored outside the app — the downloadable template
 * filled in by an AI platform, pasted back. Authoring guidance is the same
 * authority whether it is typed or pasted, so this is `canWrite`, and ownership
 * goes through resolveOwnership exactly as a hand-made playbook does.
 *
 * ONE PLAYBOOK PER TRANSACTION, and a failure does not abort the batch. A paste
 * of twelve where the ninth has a bad category should leave eleven playbooks and
 * a line saying what was wrong with the ninth — not nothing at all and a QA
 * re-running the whole prompt.
 */
export const importPlaybooks = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = importSchema.parse(req.body ?? {});

  const created: {
    index: number;
    id: string;
    slug: string;
    name: string;
    category: string;
    itemCount: number;
  }[] = [];
  const failed: { index: number; name: string; error: string }[] = [];

  for (let index = 0; index < body.playbooks.length; index += 1) {
    const entry = body.playbooks[index];
    const { ownerTenantId, visibility } = resolveOwnership(req, entry.visibility);

    try {
      const result = await withTenant(tenantId, async (client) => {
        const playbook = await repo.createPlaybook(client, {
          ownerTenantId,
          createdBy: userId ?? null,
          name: entry.name,
          category: entry.category,
          summary: entry.summary,
          overview: entry.overview,
          version: entry.version,
          visibility: visibility as any,
          priceCredits: entry.price_credits ?? null,
          priceAmount: entry.price_amount ?? null,
          priceCurrency: entry.price_currency,
        });

        const content = await repo.replaceContent(
          client,
          playbook.id,
          {
            sections: entry.sections as any,
            version: entry.version,
            changelog: entry.changelog ?? 'Imported',
          },
          userId ?? null
        );

        return { ...playbook, itemCount: (content as any)?.itemCount ?? 0 };
      });

      created.push({
        index,
        id: result.id,
        slug: result.slug,
        name: entry.name,
        category: entry.category,
        itemCount: result.itemCount,
      });
    } catch (err: any) {
      failed.push({
        index,
        name: entry.name,
        error: err?.message || 'Could not import this playbook',
      });
    }
  }

  if (created.length > 0) {
    recordTransaction({
      req: req as any,
      section: Section.WORK,
      module: Module.QA_WORKSPACE,
      page: Page.QA_CASE_LIST,
      action: Action.CREATE,
      actionLabel: `Imported ${created.length} playbook${created.length === 1 ? '' : 's'}`,
      entityType: EntityType.QA_CASE,
      entityId: created[0].id,
      entityLabel: created.map((c) => c.name).join(', ').slice(0, 240),
    });
  }

  ok(res, {
    created,
    failed,
    itemCount: created.reduce((sum, c) => sum + c.itemCount, 0),
  });
});

/**
 * POST /api/v2/qa/playbooks/ai/from-document
 *
 * A PRD, spec or feature brief in — draft playbooks out. NOTHING IS CREATED
 * here: the drafts go back to the author, who reviews them in the import
 * preview and decides. A document read by a model is exactly the case where a
 * human must look before rows appear in the catalog.
 *
 * Metered like every other Zai call, and gated the same way: authoring rights
 * plus the per-user AI toggle.
 */
export const aiPlaybooksFromDocument = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const file = (req as any).file as
    | { buffer: Buffer; originalname: string; mimetype: string; size: number }
    | undefined;

  const documentId =
    typeof req.body?.document_id === 'string' ? req.body.document_id.trim() : '';
  const brief = typeof req.body?.brief === 'string' ? req.body.brief.trim().slice(0, 4000) : '';

  if (!file && !documentId && !brief) {
    throw new PlaybookError(
      'Describe what you are testing, attach a document, or choose one from Document Hub',
      400,
      'NO_DOCUMENT'
    );
  }

  const hint = typeof req.body?.hint === 'string' ? req.body.hint.trim().slice(0, 400) : '';
  /* Up to 100. The ceiling is the author's to set: what actually limits the
     result is how many distinct features the document describes, and the plan
     returns fewer whenever that is fewer. */
  const requested = Number(req.body?.max_playbooks);
  const maxPlaybooks = Number.isFinite(requested)
    ? Math.min(Math.max(1, Math.round(requested)), 100)
    : 3;

  // Text first: an unreadable document must not spend a credit check, let alone
  // a provider call.
  let text: string;
  let source = '';

  if (brief && !file && !documentId) {
    /* No document at all — the author typed what they have. Wrapped into the
       same shape the rest of this path reads, so the planning and writing
       passes need no idea which they were given, and the wrapper is explicit
       that silence in a two-line brief is a question to ask rather than a
       licence to invent. */
    if (brief.length < 15) {
      throw new PlaybookError(
        'Say a little more about what you are testing.',
        400,
        'BRIEF_TOO_SHORT'
      );
    }
    text = [
      'The author has no written specification. This is what they say they are building,',
      'in their own words:',
      '',
      '"""',
      brief,
      '"""',
      '',
      'Treat the description above as the requirements. It is deliberately short, so where',
      'it is silent on a limit, a state, a permission or an error path, write the',
      'recommendation as the question a QA must answer — never as an assumption about how',
      'it works.',
    ].join('\n');
    source = 'Typed description';
  } else if (file) {
    text = await extractDocumentText({
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
    });
    source = file.originalname;
  } else {
    /* A Document Hub page. Read with the SAME visibility rule the hub's own
       endpoint uses — tenant, plus public or yours or shared with you — so this
       route cannot become a way to read a document you could not open there.
       Only a `file` node holds a document; sections and folders have none. */
    const { rows } = await pool.query(
      `SELECT id, title, content
         FROM documents
        WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false
          AND (visibility = 'public' OR "createdById" = $3 OR $3 = ANY(shared_with))`,
      [documentId, tenantId, actorOf(req).userId]
    );
    if (rows.length === 0) {
      throw new PlaybookError('That document is not available to you', 404, 'NOT_FOUND');
    }

    const content = rows[0].content;
    text = blocksToText(Array.isArray(content) ? content : content?.blocks ?? []);
    source = rows[0].title || 'Document Hub page';
  }

  await assertAiCredits(tenantId);

  let aiResponse;
  try {
    aiResponse = await outlinePlaybooksFromDocument({ text, hint, maxPlaybooks }, tenantId);
  } catch (err: any) {
    if (err instanceof PlaybookError) throw err;
    console.error('[qa-playbooks] document outline failed:', err);
    throw new PlaybookError(
      err?.message || 'Zai could not read that document into playbooks.',
      502,
      'AI_FAILED'
    );
  }

  // Metering must not cost the author their drafts: the provider call is
  // already paid for by this point.
  let credits: number | undefined;
  try {
    const pricing = await AIPricingEngine.calculate(aiResponse);
    credits = pricing.credits;
    await entitlementService.incrementUsage(
      tenantId,
      'ai_credits_month',
      AIFeature.PLAYBOOK_DRAFT,
      pricing
    );
  } catch (err) {
    console.error('[qa-playbooks] AI usage metering failed (drafts still returned):', err);
  }

  const data = aiResponse.data as any;
  ok(res, {
    /* The plan, and the text it was planned from. The caller writes one playbook
       at a time from these, which is what keeps each call short enough to
       finish and report. */
    outline: data.outline ?? [],
    document: data.document ?? '',
    source,
    model: aiResponse.model,
    credits,
  });
});

/**
 * POST /api/v2/qa/playbooks/ai/from-document/expand
 *
 * Writes ONE planned playbook. Called once per entry in the outline, so the
 * client can show which playbook is being written and a failure costs that
 * playbook rather than the whole document.
 */
export const aiExpandPlaybookOutline = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const document = typeof req.body?.document === 'string' ? req.body.document : '';
  const outline = req.body?.outline;

  if (!document || !outline?.name) {
    throw new PlaybookError('Send the document text and the planned playbook', 400, 'BAD_REQUEST');
  }

  await assertAiCredits(tenantId);

  let aiResponse;
  try {
    aiResponse = await expandPlaybookOutline({ document, outline }, tenantId);
  } catch (err: any) {
    if (err instanceof PlaybookError) throw err;
    console.error('[qa-playbooks] expand failed:', err);
    throw new PlaybookError(err?.message || 'Zai could not write that playbook.', 502, 'AI_FAILED');
  }

  let credits: number | undefined;
  try {
    const pricing = await AIPricingEngine.calculate(aiResponse);
    credits = pricing.credits;
    await entitlementService.incrementUsage(
      tenantId,
      'ai_credits_month',
      AIFeature.PLAYBOOK_DRAFT,
      pricing
    );
  } catch (err) {
    console.error('[qa-playbooks] AI usage metering failed (playbook still returned):', err);
  }

  ok(res, { playbook: (aiResponse.data as any).playbook, model: aiResponse.model, credits });
});

/* ── Generating test cases ───────────────────────────────────────────────── */

export const generate = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const slug = String(req.params.slug || '').trim();
  const body = generateSchema.parse(req.body ?? {});

  const context = await withTenant(tenantId, async (client) => {
    const playbook = await repo.getPlaybookBySlug(client, slug);
    if (!playbook) throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');
    if (playbook.locked) {
      throw new PlaybookError(
        'This playbook is locked. Request access before generating test cases from it.',
        402,
        'PLAYBOOK_LOCKED'
      );
    }

    // getItemsByIds re-applies the visibility and unlock scope, so this cannot
    // become a back door into a locked body even if the check above changed.
    const items = await repo.getItemsByIds(client, playbook.id, body.item_ids);
    if (items.length === 0) {
      throw new PlaybookError('None of the selected recommendations belong to this playbook', 400);
    }
    return { playbook, items };
  });

  const result = await generateCasesFromItems({
    tenantId,
    userId: userId ?? null,
    playbookName: context.playbook.name,
    parentTitle: body.parent_title,
    moduleId: body.module_id,
    projectId: body.project_id ?? null,
    feature: body.feature ?? null,
    status: body.status,
    items: context.items,
  });

  await withTenant(tenantId, (client) =>
    repo.recordGeneration(client, {
      playbookId: context.playbook.id,
      projectId: body.project_id ?? null,
      moduleId: body.module_id,
      parentTestCaseId: result.parentId,
      itemKeys: context.items.map((i) => i.key),
      createdCount: result.createdCount,
      createdBy: userId ?? null,
    })
  );

  recordTransaction({
    req: req as any,
    section: Section.WORK,
    module: Module.QA_WORKSPACE,
    page: Page.QA_CASE_LIST,
    action: Action.CREATE,
    actionLabel: `Generated ${result.createdCount} test case(s) from the ${context.playbook.name} playbook`,
    entityType: EntityType.QA_CASE,
    entityId: result.parentId,
    entityLabel: result.parentTitle,
    afterData: {
      playbook: context.playbook.slug,
      parent_test_case_id: result.parentId,
      created_count: result.createdCount,
    },
  });

  ok(
    res,
    {
      parent_id: result.parentId,
      parent_title: result.parentTitle,
      created_count: result.createdCount,
      skipped_count: body.item_ids.length - result.createdCount,
    },
    201
  );
});

/* ── Zai ─────────────────────────────────────────────────────────────────── */

/**
 * POST /api/v2/qa/playbooks/ai/draft-recommendation
 *
 * Drafts ONE recommendation from the author's specific point and returns it.
 * Deliberately persists nothing: the author previews the card and decides. The
 * draft only becomes real through the ordinary content save, so an unwanted
 * suggestion costs a click rather than a cleanup.
 */
/**
 * The credit check, with the two failure modes told apart. Shared by every Zai
 * endpoint here, so the reasoning below exists once.
 *
 * A real EntitlementError is an answer — the workspace is out of credits — and
 * always fails closed. Everything else means we could not READ the limit:
 * checkLimit resolves the subscription through a Redis-backed cache, and when
 * that cache is unreachable it returns null and checkLimit raises a plain
 * "No active subscription found for tenant". Treating that as a refusal takes
 * AI down for everyone whenever the cache hiccups.
 *
 * So an unreadable limit fails OPEN, matching what the rest of the platform
 * already does (middleware/aiAccess.ts fails open on the same reasoning, and
 * the entitlements module defaults ENTITLEMENTS_FAIL_OPEN to true). Set
 * ENTITLEMENTS_FAIL_OPEN=false to fail closed instead.
 *
 * Usage is still recorded either way: incrementUsage writes to Postgres, not
 * Redis, so an outage costs the ceiling check — never the accounting.
 */
async function assertAiCredits(tenantId: string): Promise<void> {
  const failClosed = process.env.ENTITLEMENTS_FAIL_OPEN === 'false';
  try {
    // Bounded: an unreachable cache leaves the client retrying forever, which
    // would hang this request rather than fail it.
    await Promise.race([
      entitlementService.checkLimit(tenantId, 'ai_credits_month'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI credit check timed out')), 5000)
      ),
    ]);
  } catch (err: any) {
    if (err instanceof EntitlementError) {
      throw new PlaybookError(
        'Your workspace has reached its AI credit limit for this month',
        403,
        'AI_LIMIT_REACHED'
      );
    }
    console.error(
      `[qa-playbooks] AI credit limit could not be read (${err?.message}) — ${
        failClosed ? 'refusing' : 'proceeding'
      }`
    );
    if (failClosed) {
      throw new PlaybookError(
        err?.message || 'AI usage could not be verified for this workspace right now',
        503,
        'AI_UNAVAILABLE'
      );
    }
  }
}

export const aiDraftRecommendation = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const body = zaiDraftSchema.parse(req.body ?? {});

  await assertAiCredits(tenantId);

  let aiResponse;
  try {
    aiResponse = await draftRecommendation(
      {
        point: body.point,
        playbookName: body.playbook_name ?? '',
        sectionTitle: body.section_title ?? undefined,
        level: body.level ?? undefined,
        category: body.category ?? undefined,
      },
      tenantId
    );
  } catch (err: any) {
    // The service raises PlaybookError for the cases it understands (no
    // provider configured, unparseable output). Anything else is the provider
    // itself failing, and its message beats a bare 500.
    if (err instanceof PlaybookError) throw err;
    console.error('[qa-playbooks] Zai draft failed:', err);
    throw new PlaybookError(
      err?.message || 'Zai could not draft that. Try rephrasing the point.',
      502,
      'AI_FAILED'
    );
  }

  // Metering must not cost the author their draft. The provider call has
  // already been paid for by this point; failing the request here would spend
  // that and hand back nothing, so a metering failure is logged, not raised.
  let credits: number | undefined;
  try {
    const pricing = await AIPricingEngine.calculate(aiResponse);
    credits = pricing.credits;
    await entitlementService.incrementUsage(
      tenantId,
      'ai_credits_month',
      AIFeature.PLAYBOOK_DRAFT,
      pricing
    );
  } catch (err) {
    console.error('[qa-playbooks] AI usage metering failed (draft still returned):', err);
  }

  ok(res, { recommendation: aiResponse.data, credits: credits ?? null });
});

/* ── Access ──────────────────────────────────────────────────────────────── */

/** POST /api/v2/qa/playbooks/:slug/unlock-request */
export const requestUnlock = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const slug = String(req.params.slug || '').trim();
  const body = unlockRequestSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, async (client) => {
    const playbook = await repo.getPlaybookBySlug(client, slug);
    if (!playbook) throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');
    if (playbook.visibility !== 'premium') {
      throw new PlaybookError('This playbook does not need to be unlocked', 400);
    }
    if (!playbook.locked) {
      throw new PlaybookError('Your workspace already has access to this playbook', 400);
    }
    return repo.requestUnlock(client, playbook.id, userId ?? null, body.message ?? null);
  });

  ok(res, { request_id: result.id, already_open: result.alreadyOpen }, result.alreadyOpen ? 200 : 201);
});

/** GET /api/v2/qa/playbooks/admin/unlock-requests */
export const listRequests = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
  const rows = await withTenant(tenantId, (client) =>
    repo.listUnlockRequests(client, status === 'all' ? undefined : status)
  );
  ok(res, rows);
});

/** POST /api/v2/qa/playbooks/admin/unlock-requests/:id */
export const decideRequest = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const body = decisionSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, (client) =>
    repo.decideUnlockRequest(
      client,
      id,
      body.decision,
      userId ?? null,
      body.note ?? null,
      body.expires_at ?? null
    )
  );
  if (!result) throw new PlaybookError('Request not found or already decided', 404, 'NOT_FOUND');

  ok(res, { id, decision: body.decision });
});

/* ── "Write us a playbook for this" ──────────────────────────────────────── */

/**
 * POST /api/v2/qa/playbooks/requests
 *
 * Open to anyone who can read the catalog: a QA who finds nothing for the
 * feature they are testing is exactly the person whose ask is worth having, and
 * gating it behind authoring rights would silence them.
 */
export const requestPlaybook = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = playbookRequestSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, (client) =>
    repo.createPlaybookRequest(client, {
      requestedBy: userId ?? null,
      title: body.title,
      category: body.category ?? null,
      details: body.details ?? null,
    })
  );

  if (!result.alreadyOpen) {
    recordTransaction({
      req: req as any,
      section: Section.WORK,
      module: Module.QA_WORKSPACE,
      page: Page.QA_CASE_LIST,
      action: Action.CREATE,
      actionLabel: `Playbook requested: ${body.title}`,
      entityType: EntityType.QA_CASE,
      entityId: result.id,
      entityLabel: body.title,
    });
  }

  ok(res, result);
});

/** GET /api/v2/qa/playbooks/requests — this workspace's own asks. */
export const listMyPlaybookRequests = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const rows = await withTenant(tenantId, (client) =>
    repo.listPlaybookRequests(client, { status, mine: true })
  );
  ok(res, rows);
});

/** GET /api/v2/qa/playbooks/admin/playbook-requests — every workspace's asks. */
export const listAllPlaybookRequests = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
  const rows = await withTenant(tenantId, (client) =>
    repo.listPlaybookRequests(client, { status, mine: false })
  );
  ok(res, rows);
});

/** POST /api/v2/qa/playbooks/admin/playbook-requests/:id — move one along. */
export const decidePlaybookRequest = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const body = playbookRequestDecisionSchema.parse(req.body ?? {});

  const result = await withTenant(tenantId, (client) =>
    repo.decidePlaybookRequest(client, id, {
      status: body.status,
      decidedBy: userId ?? null,
      note: body.note ?? null,
      playbookId: body.playbook_id ?? null,
    })
  );
  if (!result) throw new PlaybookError('Request not found', 404, 'NOT_FOUND');

  ok(res, { id, status: body.status });
});

/** POST /api/v2/qa/playbooks/:id/grant — grant a tenant access directly. */
export const grant = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const id = String(req.params.id);
  const body = grantSchema.parse(req.body ?? {});

  await withTenant(tenantId, async (client) => {
    const owner = await repo.getOwnership(client, id);
    if (!owner) throw new PlaybookError('Playbook not found', 404, 'NOT_FOUND');
    if (owner.visibility !== 'premium') {
      throw new PlaybookError('Only a premium playbook needs granting', 400);
    }
    await repo.grantUnlock(
      client,
      id,
      body.tenant_id,
      userId ?? null,
      body.note ?? null,
      body.expires_at ?? null
    );
  });

  ok(res, { playbook_id: id, tenant_id: body.tenant_id, granted: true }, 201);
});

/** DELETE /api/v2/qa/playbooks/:id/grant/:tenantId */
export const revoke = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const id = String(req.params.id);
  const target = String(req.params.tenantId);

  await withTenant(tenantId, (client) => repo.revokeUnlock(client, id, target));
  ok(res, { playbook_id: id, tenant_id: target, revoked: true });
});

/** GET /api/v2/qa/playbooks/:id/grants */
export const listGrants = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const rows = await withTenant(tenantId, (client) =>
    repo.listUnlocks(client, String(req.params.id))
  );
  ok(res, rows);
});
