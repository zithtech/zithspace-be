// src/modules/opening-management/services/opening.service.ts
//
// Business logic for Openings (Phase 1 — create / read / update / delete).
// Owns the transaction boundary (withTenant) and the rules; repositories do the
// SQL.
//
// Rule of the phase: an opening is always born in 'draft'. Status only moves
// through the approval + posting lifecycle (Phases 2–4), never through the
// create/update endpoints here.

import { TenantClient, withTenant } from '../db/pool';
import * as repo from '../repositories/opening.repo';
import * as teamRepo from '../repositories/openingTeam.repo';
import * as statusRepo from '../repositories/openingStatus.repo';
import {
  Actor,
  Opening,
  OpeningDetail,
  OpeningError,
  OpeningListItem,
  OpeningWithRefs,
  Paginated,
} from '../types';
import {
  CreateOpeningInput,
  ListOpeningsQuery,
  UpdateOpeningInput,
} from '../validators/opening.validator';

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = '23505';

// ─── Reference integrity ────────────────────────────────────────────────────
// This module keeps no foreign keys into Prisma-owned tables, so "does this id
// exist, and is it ours?" is checked here instead. Table names below are fixed
// literals — never interpolate anything caller-supplied into SQL.

async function assertBelongsToTenant(
  client: TenantClient,
  table: string,
  id: string,
  label: string
): Promise<void> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, client.tenantId]
  );
  if (!rowCount) {
    throw OpeningError.badRequest(`${label} does not exist for this tenant`);
  }
}

/** A client id may live in either client master. Accept whichever matches. */
async function assertClientExists(client: TenantClient, id: string): Promise<void> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM recruitment_client_basic_information WHERE id = $1 AND tenant_id = $2
     UNION ALL
     SELECT 1 FROM clients_v2 WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [id, client.tenantId]
  );
  if (!rowCount) {
    throw OpeningError.badRequest('Client does not exist for this tenant');
  }
}

/** All the user ids referenced by an opening must be users of this tenant. */
async function assertUsersExist(
  client: TenantClient,
  userIds: string[],
  label: string
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE tenant_id = $1 AND id = ANY($2::text[])`,
    [client.tenantId, unique]
  );
  const found = new Set(rows.map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw OpeningError.badRequest(`${label} not found for this tenant: ${missing.join(', ')}`);
  }
}

/**
 * Validate every reference carried by a create/update payload. Only the keys
 * actually present are checked, so a partial update never re-validates fields
 * the caller did not touch.
 */
async function validateReferences(
  client: TenantClient,
  input: Partial<CreateOpeningInput>
): Promise<void> {
  if (input.clientId) await assertClientExists(client, input.clientId);
  if (input.projectId) await assertBelongsToTenant(client, 'projects', input.projectId, 'Project');
  if (input.departmentId)
    await assertBelongsToTenant(client, 'departments', input.departmentId, 'Department');
  if (input.subDepartmentId)
    await assertBelongsToTenant(client, 'sub_departments', input.subDepartmentId, 'Sub-department');
  if (input.employmentTypeId)
    await assertBelongsToTenant(client, 'employment_types', input.employmentTypeId, 'Employment type');
  if (input.locationId)
    await assertBelongsToTenant(client, 'company_locations', input.locationId, 'Location');

  const userIds: string[] = [];
  if (input.hiringManagerId) userIds.push(input.hiringManagerId);
  if (input.recruiters) userIds.push(...input.recruiters.map((r) => r.recruiterId));
  if (input.hiringTeam) {
    userIds.push(...input.hiringTeam.map((m) => m.memberId).filter((id): id is string => !!id));
  }
  await assertUsersExist(client, userIds, 'User(s)');
}

// ─── Assembly ───────────────────────────────────────────────────────────────

async function loadDetail(
  client: TenantClient,
  opening: OpeningWithRefs
): Promise<OpeningDetail> {
  const [recruiters, hiringTeam, requiredDocuments] = await Promise.all([
    teamRepo.findRecruiters(client, opening.id),
    teamRepo.findHiringTeam(client, opening.id),
    teamRepo.findDocuments(client, opening.id),
  ]);
  return { ...opening, recruiters, hiringTeam, requiredDocuments };
}

/** Persist whichever child collections the payload supplied. */
async function saveChildren(
  client: TenantClient,
  openingId: string,
  input: Partial<CreateOpeningInput>,
  actor: Actor
): Promise<void> {
  if (input.recruiters) {
    await teamRepo.replaceRecruiters(
      client,
      openingId,
      input.recruiters.map((r) => ({ recruiterId: r.recruiterId, isPrimary: r.isPrimary })),
      actor.userId
    );
  }
  if (input.hiringTeam) {
    await teamRepo.replaceHiringTeam(
      client,
      openingId,
      input.hiringTeam.map((m) => ({
        memberType: m.memberType,
        memberId: m.memberId ?? null,
        memberName: m.memberName ?? null,
        memberEmail: m.memberEmail ?? null,
      })),
      actor.userId
    );
  }
  if (input.requiredDocuments) {
    await teamRepo.replaceDocuments(
      client,
      openingId,
      input.requiredDocuments.map((d) => ({
        documentName: d.documentName,
        isMandatory: d.isMandatory,
        notes: d.notes ?? null,
      })),
      actor.userId
    );
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createOpening(
  actor: Actor,
  input: CreateOpeningInput
): Promise<OpeningDetail> {
  // The opening code is derived from the current max, so two simultaneous
  // creates can pick the same one. The unique index rejects the loser; retry.
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; ; attempt++) {
    try {
      return await withTenant(actor.tenantId, async (client) => {
        await validateReferences(client, input);

        const openingCode = await repo.nextOpeningCode(client);
        const opening = await repo.insert(client, {
          openingCode,
          clientId: input.clientId ?? null,
          projectId: input.projectId ?? null,
          departmentId: input.departmentId ?? null,
          subDepartmentId: input.subDepartmentId ?? null,
          hiringManagerId: input.hiringManagerId ?? null,
          employmentTypeId: input.employmentTypeId ?? null,
          employmentType: input.employmentType,
          workMode: input.workMode,
          locationId: input.locationId ?? null,
          location: input.location ?? null,
          numberOfPositions: input.numberOfPositions,
          jobTitle: input.jobTitle,
          jobDescription: input.jobDescription ?? null,
          responsibilities: input.responsibilities ?? null,
          requiredSkills: input.requiredSkills ?? [],
          preferredSkills: input.preferredSkills ?? [],
          minExperience: input.minExperience ?? null,
          maxExperience: input.maxExperience ?? null,
          education: input.education ?? null,
          certifications: input.certifications ?? [],
          salaryMin: input.salaryMin ?? null,
          salaryMax: input.salaryMax ?? null,
          salaryCurrency: input.salaryCurrency,
          salaryPeriod: input.salaryPeriod,
          budget: input.budget ?? null,
          noticePeriodDays: input.noticePeriodDays ?? null,
          shiftTiming: input.shiftTiming ?? null,
          joiningTimeline: input.joiningTimeline ?? null,
          targetJoiningDate: input.targetJoiningDate ?? null,
          priority: input.priority,
          hiringType: input.hiringType ?? null,
          visibility: input.visibility,
          createdBy: actor.userId,
        });

        await saveChildren(client, opening.id, input, actor);

        // Open the status timeline (Phase 3) with the creation entry, so every
        // opening's history starts at the same place.
        await statusRepo.appendHistory(client, {
          openingId: opening.id,
          fromStatus: null,
          toStatus: 'draft',
          reason: 'created',
          note: null,
          changedBy: actor.userId,
        });

        const withRefs = await repo.findById(client, opening.id);
        if (!withRefs) throw OpeningError.notFound('Opening');
        return loadDetail(client, withRefs);
      });
    } catch (err: any) {
      const isCodeRace =
        err?.code === UNIQUE_VIOLATION && err?.constraint === 'uq_om_openings_tenant_code';
      if (isCodeRace && attempt < MAX_ATTEMPTS) continue;
      if (err?.code === UNIQUE_VIOLATION) {
        throw OpeningError.conflict('This opening conflicts with an existing record');
      }
      throw err;
    }
  }
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Paginated list. Each row carries its recruiters (fetched in one extra query,
 * not per row) because the listing UI shows them; the heavier hiring team and
 * document sets are detail-only.
 */
export async function listOpenings(
  actor: Actor,
  query: ListOpeningsQuery
): Promise<Paginated<OpeningListItem>> {
  return withTenant(actor.tenantId, async (client) => {
    const filters: repo.ListFilters = {
      search: query.search,
      status: query.status,
      priority: query.priority,
      employmentType: query.employmentType,
      workMode: query.workMode,
      visibility: query.visibility,
      hiringType: query.hiringType,
      clientId: query.clientId,
      projectId: query.projectId,
      departmentId: query.departmentId,
      subDepartmentId: query.subDepartmentId,
      hiringManagerId: query.hiringManagerId,
      recruiterId: query.recruiterId,
      archived: query.archived,
    };

    const total = await repo.countAll(client, filters);
    const rows = await repo.findAll(client, filters, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const recruitersByOpening = await teamRepo.findRecruitersForOpenings(
      client,
      rows.map((r) => r.id)
    );

    return {
      items: rows.map((row) => ({
        ...row,
        recruiters: recruitersByOpening.get(row.id) ?? [],
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  });
}

export async function getOpening(actor: Actor, id: string): Promise<OpeningDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await repo.findById(client, id);
    if (!opening) throw OpeningError.notFound('Opening');
    return loadDetail(client, opening);
  });
}

// ─── Update ─────────────────────────────────────────────────────────────────

/**
 * Partial update of an opening's own fields; child collections are replaced
 * wholesale when present in the payload and left alone when absent.
 *
 * Cross-field range checks re-run against the MERGED record, so sending only
 * `salaryMin` still cannot push it above the stored `salaryMax`.
 */
export async function updateOpening(
  actor: Actor,
  id: string,
  input: UpdateOpeningInput
): Promise<OpeningDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findById(client, id);
    if (!existing) throw OpeningError.notFound('Opening');

    // An opening under review is frozen: approvers decided on the content in
    // front of them, so it must not change beneath them. Withdraw (or let the
    // chain finish) to edit again.
    if (existing.status === 'pending_approval') {
      throw OpeningError.conflict(
        'This opening is awaiting approval and cannot be edited — withdraw it first'
      );
    }

    await validateReferences(client, input as Partial<CreateOpeningInput>);
    assertMergedRangesValid(existing, input);

    const { recruiters, hiringTeam, requiredDocuments, ...fields } = input as any;

    // A payload of nothing but child collections is legitimate — skip the
    // no-op UPDATE in that case.
    if (Object.keys(fields).length > 0) {
      const updated = await repo.update(client, id, { ...fields, updatedBy: actor.userId });
      if (!updated) throw OpeningError.notFound('Opening');
    }

    await saveChildren(client, id, input as Partial<CreateOpeningInput>, actor);

    const withRefs = await repo.findById(client, id);
    if (!withRefs) throw OpeningError.notFound('Opening');
    return loadDetail(client, withRefs);
  });
}

/** Range rules evaluated against stored-value ∪ incoming-value. */
function assertMergedRangesValid(existing: Opening, input: UpdateOpeningInput): void {
  const pick = <K extends keyof Opening>(key: K): any =>
    (input as any)[key] !== undefined ? (input as any)[key] : existing[key];

  const minExp = pick('minExperience');
  const maxExp = pick('maxExperience');
  if (minExp != null && maxExp != null && maxExp < minExp) {
    throw OpeningError.badRequest('maxExperience must be greater than or equal to minExperience');
  }

  const salaryMin = pick('salaryMin');
  const salaryMax = pick('salaryMax');
  if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
    throw OpeningError.badRequest('salaryMax must be greater than or equal to salaryMin');
  }
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * Soft delete. Child rows are intentionally left in place: they cascade only on
 * a hard delete, and keeping them means a restore is a single flag flip.
 */
export async function deleteOpening(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDelete(client, id, actor.userId);
    if (!ok) throw OpeningError.notFound('Opening');
  });
}

// ─── Child collections (standalone endpoints) ───────────────────────────────

async function requireOpening(client: TenantClient, id: string): Promise<OpeningWithRefs> {
  const opening = await repo.findById(client, id);
  if (!opening) throw OpeningError.notFound('Opening');
  return opening;
}

export async function setRecruiters(
  actor: Actor,
  openingId: string,
  recruiters: { recruiterId: string; isPrimary: boolean }[]
): Promise<OpeningDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    await assertUsersExist(client, recruiters.map((r) => r.recruiterId), 'Recruiter(s)');
    await teamRepo.replaceRecruiters(client, openingId, recruiters, actor.userId);
    return loadDetail(client, opening);
  });
}

export async function setHiringTeam(
  actor: Actor,
  openingId: string,
  members: teamRepo.HiringTeamMemberData[]
): Promise<OpeningDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    await assertUsersExist(
      client,
      members.map((m) => m.memberId).filter((id): id is string => !!id),
      'Hiring team member(s)'
    );
    await teamRepo.replaceHiringTeam(client, openingId, members, actor.userId);
    return loadDetail(client, opening);
  });
}

export async function setRequiredDocuments(
  actor: Actor,
  openingId: string,
  documents: teamRepo.RequiredDocumentData[]
): Promise<OpeningDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const opening = await requireOpening(client, openingId);
    await teamRepo.replaceDocuments(client, openingId, documents, actor.userId);
    return loadDetail(client, opening);
  });
}
