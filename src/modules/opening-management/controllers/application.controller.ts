// src/modules/opening-management/controllers/application.controller.ts
// Thin HTTP layer for Phase 5 candidate intake.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/application.service';
import {
  changeStageSchema,
  createApplicationSchema,
  listApplicationsQuerySchema,
  skillMatchSchema,
  updateApplicationSchema,
} from '../validators/application.validator';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

/** The ten intake channels, for UI dropdowns. */
const INTAKE_SOURCES = [
  { value: 'careers_page', label: 'Careers Page' },
  { value: 'employee_referral', label: 'Employee Referral', requiresReferrer: true },
  { value: 'internal_transfer', label: 'Internal Transfer' },
  { value: 'internal_job_posting', label: 'Internal Job Posting (IJP)' },
  { value: 'recruitment_agency', label: 'Recruitment Agency', detailLabel: 'Agency name' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'naukri', label: 'Naukri' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'manual_upload', label: 'Manual Upload' },
  { value: 'campus_hiring', label: 'Campus Hiring', detailLabel: 'Institution' },
  { value: 'other', label: 'Other', requiresDetail: true },
];

const APPLICATION_STAGES = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'on_hold', label: 'On Hold' },
];

export const catalog = handle(async (_req: AuthRequest, res: Response) => {
  ok(res, { sources: INTAKE_SOURCES, stages: APPLICATION_STAGES });
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createApplicationSchema.parse(req.body);
  const application = await service.addApplication(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_CANDIDATES,
    action: Action.CREATE,
    actionLabel: `Added ${application.candidateName ?? 'a candidate'} to the opening via ${application.source}`,
    entityType: EntityType.OPENING_APPLICATION,
    entityId: application.id,
    entityLabel: application.candidateName ?? application.candidateId,
    afterData: {
      source: application.source,
      sourceDetail: application.sourceDetail,
      stage: application.stage,
    },
  });
  ok(res, application, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const query = listApplicationsQuerySchema.parse(req.query);
  ok(res, await service.listApplications(actorOf(req), req.params.id, query));
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getApplication(actorOf(req), req.params.id, req.params.applicationId));
});

/** Score a resume's skills against this opening. Read-only, nothing stored. */
export const skillMatch = handle(async (req: AuthRequest, res: Response) => {
  const { skills } = skillMatchSchema.parse(req.body);
  ok(res, await service.matchSkills(actorOf(req), req.params.id, skills));
});

export const funnel = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getFunnel(actorOf(req), req.params.id));
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateApplicationSchema.parse(req.body);
  const application = await service.updateApplication(
    actorOf(req),
    req.params.id,
    req.params.applicationId,
    input
  );
  ok(res, application);
});

export const changeStage = handle(async (req: AuthRequest, res: Response) => {
  const input = changeStageSchema.parse(req.body);
  const result = await service.changeStage(
    actorOf(req),
    req.params.id,
    req.params.applicationId,
    input
  );
  const app = result.application;
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_CANDIDATES,
    action: Action.STATUS_CHANGE,
    actionLabel: `Moved ${app.candidateName ?? 'a candidate'} to "${app.stage}"`,
    entityType: EntityType.OPENING_APPLICATION,
    entityId: app.id,
    entityLabel: app.candidateName ?? app.candidateId,
    afterData: {
      stage: app.stage,
      note: input.note,
      rejectionReason: app.rejectionReason,
      positionsFilled: result.positionsFilled,
    },
    changedFields: ['stage'],
  });
  ok(res, result);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getApplication(actor, req.params.id, req.params.applicationId);
  await service.removeApplication(actor, req.params.id, req.params.applicationId);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.OPENING_CANDIDATES,
    action: Action.DELETE,
    actionLabel: `Removed ${existing.candidateName ?? 'a candidate'} from the opening`,
    entityType: EntityType.OPENING_APPLICATION,
    entityId: req.params.applicationId,
    entityLabel: existing.candidateName ?? existing.candidateId,
    beforeData: { stage: existing.stage, source: existing.source },
  });
  ok(res, { id: req.params.applicationId, deleted: true });
});

/** Where else is this candidate in play? Guards against duplicate effort. */
export const candidatePipeline = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getCandidatePipeline(actorOf(req), req.params.candidateId));
});
