// src/modules/opening-management/controllers/opening.controller.ts
// Thin HTTP layer: validate input → call service → shape response.
// No business logic here.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { z } from 'zod';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/opening.service';
import {
  createOpeningSchema,
  hiringTeamMemberSchema,
  listOpeningsQuerySchema,
  recruiterSchema,
  requiredDocumentSchema,
  updateOpeningSchema,
} from '../validators/opening.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
  diffShallow,
} from '@/utils/transactionHistory';

// Fields worth showing in the activity feed's before/after diff. Child
// collections are deliberately left out — they get their own entries.
function openingSnapshot(o: any) {
  return {
    jobTitle: o.jobTitle,
    clientId: o.clientId ?? null,
    projectId: o.projectId ?? null,
    departmentId: o.departmentId ?? null,
    subDepartmentId: o.subDepartmentId ?? null,
    hiringManagerId: o.hiringManagerId ?? null,
    employmentType: o.employmentType,
    workMode: o.workMode,
    location: o.location ?? null,
    numberOfPositions: o.numberOfPositions,
    minExperience: o.minExperience ?? null,
    maxExperience: o.maxExperience ?? null,
    salaryMin: o.salaryMin ?? null,
    salaryMax: o.salaryMax ?? null,
    salaryCurrency: o.salaryCurrency,
    salaryPeriod: o.salaryPeriod,
    budget: o.budget ?? null,
    noticePeriodDays: o.noticePeriodDays ?? null,
    shiftTiming: o.shiftTiming ?? null,
    joiningTimeline: o.joiningTimeline ?? null,
    targetJoiningDate: o.targetJoiningDate ?? null,
    priority: o.priority,
    hiringType: o.hiringType ?? null,
    visibility: o.visibility,
    status: o.status,
    requiredSkills: o.requiredSkills ?? [],
    preferredSkills: o.preferredSkills ?? [],
    certifications: o.certifications ?? [],
  };
}

const label = (o: any) => `${o.openingCode} — ${o.jobTitle}`;

// ─── Openings ───────────────────────────────────────────────────────────────

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createOpeningSchema.parse(req.body);
  const opening = await service.createOpening(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_LIST,
    action: Action.CREATE,
    actionLabel: `Created opening "${label(opening)}"`,
    entityType: EntityType.OPENING,
    entityId: opening.id,
    entityLabel: label(opening),
    afterData: openingSnapshot(opening),
  });
  ok(res, opening, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const query = listOpeningsQuerySchema.parse(req.query);
  const result = await service.listOpenings(actorOf(req), query);
  ok(res, result);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const opening = await service.getOpening(actorOf(req), req.params.id);
  ok(res, opening);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateOpeningSchema.parse(req.body);
  const actor = actorOf(req);
  const before = await service.getOpening(actor, req.params.id);
  const opening = await service.updateOpening(actor, req.params.id, input);

  const { changedFields, before: b, after: a } = diffShallow(
    openingSnapshot(before),
    openingSnapshot(opening)
  );
  if (changedFields.length > 0) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.RECRUITMENT,
      page: Page.OPENING_DETAIL,
      action: Action.UPDATE,
      actionLabel: `Updated opening "${label(opening)}"`,
      entityType: EntityType.OPENING,
      entityId: opening.id,
      entityLabel: label(opening),
      beforeData: b,
      afterData: a,
      changedFields,
    });
  }
  ok(res, opening);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getOpening(actor, req.params.id);
  await service.deleteOpening(actor, req.params.id);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_LIST,
    action: Action.DELETE,
    actionLabel: `Deleted opening "${label(existing)}"`,
    entityType: EntityType.OPENING,
    entityId: req.params.id,
    entityLabel: label(existing),
    beforeData: openingSnapshot(existing),
  });
  ok(res, { id: req.params.id, deleted: true });
});

// ─── Child collections ──────────────────────────────────────────────────────
// Each is a full replacement of the set — send the complete desired list.

const recruitersBodySchema = z
  .object({ recruiters: z.array(recruiterSchema).max(50) })
  .refine((d) => d.recruiters.filter((r) => r.isPrimary).length <= 1, {
    message: 'Only one recruiter can be marked primary',
    path: ['recruiters'],
  })
  .refine((d) => new Set(d.recruiters.map((r) => r.recruiterId)).size === d.recruiters.length, {
    message: 'The same recruiter cannot be assigned twice',
    path: ['recruiters'],
  });

export const setRecruiters = handle(async (req: AuthRequest, res: Response) => {
  const { recruiters } = recruitersBodySchema.parse(req.body);
  // The project compiles with strictNullChecks off, which makes zod infer every
  // key as optional — restate the shape the service expects.
  const opening = await service.setRecruiters(
    actorOf(req),
    req.params.id,
    recruiters.map((r) => ({ recruiterId: r.recruiterId as string, isPrimary: r.isPrimary ?? false }))
  );
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_DETAIL,
    action: Action.BULK_ASSIGN,
    actionLabel: `Assigned ${recruiters.length} recruiter(s) to "${label(opening)}"`,
    entityType: EntityType.OPENING,
    entityId: opening.id,
    entityLabel: label(opening),
    afterData: { recruiters: opening.recruiters.map((r) => r.recruiterName ?? r.recruiterId) },
  });
  ok(res, opening);
});

const hiringTeamBodySchema = z.object({
  hiringTeam: z.array(hiringTeamMemberSchema).max(100),
});

export const setHiringTeam = handle(async (req: AuthRequest, res: Response) => {
  const { hiringTeam } = hiringTeamBodySchema.parse(req.body);
  const opening = await service.setHiringTeam(
    actorOf(req),
    req.params.id,
    hiringTeam.map((m) => ({
      memberType: m.memberType,
      memberId: m.memberId ?? null,
      memberName: m.memberName ?? null,
      memberEmail: m.memberEmail ?? null,
    }))
  );
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_DETAIL,
    action: Action.BULK_ASSIGN,
    actionLabel: `Updated hiring team for "${label(opening)}" (${hiringTeam.length} member(s))`,
    entityType: EntityType.OPENING,
    entityId: opening.id,
    entityLabel: label(opening),
    afterData: {
      hiringTeam: opening.hiringTeam.map((m) => `${m.memberType}: ${m.memberName ?? m.memberId}`),
    },
  });
  ok(res, opening);
});

const documentsBodySchema = z
  .object({ requiredDocuments: z.array(requiredDocumentSchema).max(50) })
  .refine(
    (d) =>
      new Set(d.requiredDocuments.map((doc) => doc.documentName.toLowerCase())).size ===
      d.requiredDocuments.length,
    { message: 'Duplicate document names are not allowed', path: ['requiredDocuments'] }
  );

export const setRequiredDocuments = handle(async (req: AuthRequest, res: Response) => {
  const { requiredDocuments } = documentsBodySchema.parse(req.body);
  const opening = await service.setRequiredDocuments(
    actorOf(req),
    req.params.id,
    requiredDocuments.map((d) => ({
      documentName: d.documentName,
      isMandatory: d.isMandatory,
      notes: d.notes ?? null,
    }))
  );
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_DETAIL,
    action: Action.UPDATE,
    actionLabel: `Updated required documents for "${label(opening)}"`,
    entityType: EntityType.OPENING,
    entityId: opening.id,
    entityLabel: label(opening),
    afterData: { requiredDocuments: opening.requiredDocuments.map((d) => d.documentName) },
  });
  ok(res, opening);
});
