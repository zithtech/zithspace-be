// src/modules/opening-management/services/application.service.ts
//
// Phase 5 — candidate intake.
//
// An application links an EXISTING candidate (the platform's `candidates`
// table) to an opening, records which channel they arrived through, and tracks
// where they are in the pipeline. This module deliberately does not create or
// own candidate records; it owns the relationship.
//
// The stage vocabulary is what Phase 6's dashboard aggregates, so the funnel
// lives here rather than being recomputed later.

import { TenantClient, withTenant } from '../db/pool';
import * as openingRepo from '../repositories/opening.repo';
import * as repo from '../repositories/application.repo';
import { performTransition } from './status.service';
import { scoreSkillMatch, SkillMatchResult } from './skillMatch';
import {
  Actor,
  ApplicationDetail,
  ApplicationFunnel,
  ApplicationStage,
  Opening,
  OpeningApplication,
  OpeningError,
  OpeningStatus,
  Paginated,
  StageChangeResult,
} from '../types';
import {
  ChangeStageInput,
  CreateApplicationInput,
  ListApplicationsQuery,
  UpdateApplicationInput,
} from '../validators/application.validator';

const UNIQUE_VIOLATION = '23505';

/**
 * Stages a candidate can no longer be moved out of by a normal stage change.
 * Re-engaging someone who withdrew means a fresh application.
 */
const TERMINAL_STAGES: ApplicationStage[] = ['hired', 'rejected', 'withdrawn'];

/** Reaching this stage means the opening is genuinely being worked. */
const INTERVIEWING_STAGES: ApplicationStage[] = ['interview', 'offer', 'hired'];

// ─── Reference checks ───────────────────────────────────────────────────────

async function requireOpening(client: TenantClient, id: string): Promise<Opening> {
  const opening = await openingRepo.findById(client, id);
  if (!opening) throw OpeningError.notFound('Opening');
  return opening;
}

/**
 * The candidate must already exist for this tenant. Creating candidate records
 * is the existing candidate API's job — duplicating it here would give the
 * platform two half-populated candidate stores.
 *
 * There are two stores (see migration 009): the ATS `candidates` table and the
 * pipeline module's own `pipeline_candidates`. An application points at one.
 */
async function assertCandidateExists(client: TenantClient, candidateId: string): Promise<void> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM candidates WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [candidateId, client.tenantId]
  );
  if (!rowCount) {
    throw OpeningError.badRequest(
      'Candidate not found for this tenant — create the candidate first, then add them to the opening'
    );
  }
}

async function assertPipelineCandidateExists(
  client: TenantClient,
  pipelineCandidateId: string
): Promise<void> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM pipeline_candidates WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
    [pipelineCandidateId, client.tenantId]
  );
  if (!rowCount) {
    throw OpeningError.badRequest('That pipeline candidate was not found for this tenant');
  }
}

async function assertUserExists(client: TenantClient, userId: string): Promise<void> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [userId, client.tenantId]
  );
  if (!rowCount) throw OpeningError.badRequest('Referring user not found for this tenant');
}

// ─── Assembly ───────────────────────────────────────────────────────────────

async function loadDetail(
  client: TenantClient,
  application: OpeningApplication
): Promise<ApplicationDetail> {
  const history = await repo.findStageHistory(client, application.id);
  return { ...application, history };
}

// ─── Intake ─────────────────────────────────────────────────────────────────

export async function addApplication(
  actor: Actor,
  openingId: string,
  input: CreateApplicationInput
): Promise<ApplicationDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);

    // Taking applications for an opening nobody approved, or one that is over,
    // is almost always a mistake worth stopping at the door.
    if (opening.status === 'draft' || opening.status === 'pending_approval') {
      throw OpeningError.badRequest(
        `This opening is still "${opening.status}" — it cannot receive candidates yet`
      );
    }
    if (['cancelled', 'closed'].includes(opening.status)) {
      throw OpeningError.badRequest(
        `This opening is "${opening.status}" — it is no longer accepting candidates`
      );
    }

    const fromPipeline = !!input.pipelineCandidateId;
    if (fromPipeline) {
      await assertPipelineCandidateExists(client, input.pipelineCandidateId as string);
    } else {
      await assertCandidateExists(client, input.candidateId as string);
    }
    if (input.referredBy) await assertUserExists(client, input.referredBy);

    const duplicate = await repo.findByCandidate(
      client,
      openingId,
      (input.pipelineCandidateId ?? input.candidateId) as string,
      fromPipeline ? 'pipeline' : 'ats'
    );
    if (duplicate) {
      throw OpeningError.conflict(
        `${duplicate.candidateName ?? 'This candidate'} is already on this opening (stage "${duplicate.stage}")`
      );
    }

    try {
      const application = await repo.insert(client, {
        openingId,
        candidateId: fromPipeline ? null : (input.candidateId as string),
        pipelineCandidateId: fromPipeline ? (input.pipelineCandidateId as string) : null,
        source: input.source,
        sourceDetail: input.sourceDetail ?? null,
        referredBy: input.referredBy ?? null,
        resumeUrl: input.resumeUrl ?? null,
        notes: input.notes ?? null,
        stage: input.stage,
        createdBy: actor.userId,
      });

      // Open the stage timeline with the intake row.
      await repo.appendStageHistory(client, {
        applicationId: application.id,
        fromStage: null,
        toStage: input.stage,
        note: `Added from ${input.source}${input.sourceDetail ? ` (${input.sourceDetail})` : ''}`,
        changedBy: actor.userId,
      });

      return loadDetail(client, application);
    } catch (err: any) {
      // The partial unique index is the real guard; the check above is only a
      // friendlier message for the common case.
      if (err?.code === UNIQUE_VIOLATION) {
        throw OpeningError.conflict('This candidate is already on this opening');
      }
      throw err;
    }
  });
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listApplications(
  actor: Actor,
  openingId: string,
  query: ListApplicationsQuery
): Promise<Paginated<OpeningApplication>> {
  return withTenant(actor.tenantId, async (client) => {
    await requireOpening(client, openingId);
    const filters = { stage: query.stage, source: query.source, search: query.search };

    const total = await repo.countByOpening(client, openingId, filters);
    const items = await repo.findByOpening(client, openingId, filters, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  });
}

export async function getApplication(
  actor: Actor,
  openingId: string,
  applicationId: string
): Promise<ApplicationDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const application = await requireApplication(client, openingId, applicationId);
    return loadDetail(client, application);
  });
}

async function requireApplication(
  client: TenantClient,
  openingId: string,
  applicationId: string
): Promise<OpeningApplication> {
  const application = await repo.findById(client, applicationId);
  if (!application || application.openingId !== openingId) {
    throw OpeningError.notFound('Application');
  }
  return application;
}

/**
 * Score a candidate's skills against this opening.
 *
 * Read-only and stateless — nothing is persisted, because the score is derived
 * from two lists that both change. Storing it would just create a number that
 * silently goes stale.
 */
export async function matchSkills(
  actor: Actor,
  openingId: string,
  skills: string[]
): Promise<SkillMatchResult & { jobTitle: string }> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    return {
      ...scoreSkillMatch(
        { requiredSkills: opening.requiredSkills, preferredSkills: opening.preferredSkills },
        skills
      ),
      jobTitle: opening.jobTitle,
    };
  });
}

/** The hiring funnel for one opening — the numbers Phase 6's dashboard shows. */
export async function getFunnel(
  actor: Actor,
  openingId: string
): Promise<ApplicationFunnel> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    const funnel = await repo.funnelForOpening(client, openingId);
    return { openPositions: opening.numberOfPositions, ...funnel };
  });
}

/** Every opening this candidate is in the pipeline for. */
export async function getCandidatePipeline(actor: Actor, candidateId: string) {
  return withTenant(actor.tenantId, (client) =>
    repo.findOpeningsForCandidate(client, candidateId)
  );
}

// ─── Updates ────────────────────────────────────────────────────────────────

export async function updateApplication(
  actor: Actor,
  openingId: string,
  applicationId: string,
  input: UpdateApplicationInput
): Promise<ApplicationDetail> {
  return withTenant(actor.tenantId, async (client) => {
    await requireApplication(client, openingId, applicationId);
    if (input.referredBy) await assertUserExists(client, input.referredBy);

    const updated = await repo.update(client, applicationId, {
      ...input,
      updatedBy: actor.userId,
    });
    if (!updated) throw OpeningError.notFound('Application');
    return loadDetail(client, updated);
  });
}

/**
 * Move a candidate through the pipeline.
 *
 * Stage order is not enforced — real recruiting skips steps (a referral can go
 * straight to offer) and doubles back. What IS enforced: you cannot move out of
 * a terminal stage, because "hired then rejected" is not a correction, it is two
 * different facts that deserve two applications.
 */
export async function changeStage(
  actor: Actor,
  openingId: string,
  applicationId: string,
  input: ChangeStageInput
): Promise<StageChangeResult> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    const application = await requireApplication(client, openingId, applicationId);

    if (application.stage === input.stage) {
      throw OpeningError.badRequest(`This candidate is already at "${input.stage}"`);
    }
    if (TERMINAL_STAGES.includes(application.stage)) {
      throw OpeningError.badRequest(
        `This application is "${application.stage}" and cannot be moved — add a new application instead`
      );
    }

    const moved = await repo.changeStage(client, applicationId, application.stage, input.stage, {
      rejectionReason: input.stage === 'rejected' ? input.rejectionReason ?? null : null,
      updatedBy: actor.userId,
    });
    if (!moved) {
      throw OpeningError.conflict('This candidate was just moved by someone else — reload and try again');
    }

    await repo.appendStageHistory(client, {
      applicationId,
      fromStage: application.stage,
      toStage: input.stage,
      note: input.note ?? input.rejectionReason ?? null,
      changedBy: actor.userId,
    });

    const openingStatusChangedTo = await advanceOpeningIfInterviewing(
      client,
      opening,
      input.stage,
      actor
    );

    const hiredCount = await repo.countHired(client, openingId);
    const refreshed = await requireApplication(client, openingId, applicationId);

    return {
      application: await loadDetail(client, refreshed),
      hiredCount,
      openPositions: opening.numberOfPositions,
      // Phase 7 owns the actual close; surfacing the fact lets the UI prompt.
      positionsFilled: hiredCount >= opening.numberOfPositions,
      openingStatusChangedTo,
    };
  });
}

/**
 * "In Progress" means candidates are being interviewed — so the first candidate
 * to reach an interview stage moves the opening there, rather than leaving it
 * sitting in `*_posting` while interviews happen.
 *
 * Best-effort by design: if the opening is somewhere the state machine will not
 * move from, that is not an error worth failing the recruiter's action over.
 */
async function advanceOpeningIfInterviewing(
  client: TenantClient,
  opening: Opening,
  toStage: ApplicationStage,
  actor: Actor
): Promise<OpeningStatus | null> {
  if (!INTERVIEWING_STAGES.includes(toStage)) return null;
  if (!['internal_posting', 'external_posting'].includes(opening.status)) return null;

  try {
    await performTransition(client, opening, 'in_progress', {
      reason: 'interviewing_started',
      note: 'A candidate reached the interview stage',
      actorId: actor.userId,
    });
    return 'in_progress';
  } catch (err) {
    // Swallow only the module's own "not allowed / raced" errors. A genuine SQL
    // failure has already aborted the transaction, and hiding it here would turn
    // that into a confusing "current transaction is aborted" further down.
    if (err instanceof OpeningError) return null;
    throw err;
  }
}

/**
 * Remove an application from the opening. Soft — the stage history is kept, and
 * the partial unique index lets the same candidate be added again afterwards.
 */
export async function removeApplication(
  actor: Actor,
  openingId: string,
  applicationId: string
): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    await requireApplication(client, openingId, applicationId);
    const ok = await repo.softDelete(client, applicationId, actor.userId);
    if (!ok) throw OpeningError.notFound('Application');
  });
}
