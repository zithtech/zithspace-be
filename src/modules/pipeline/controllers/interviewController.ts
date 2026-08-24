// src/modules/pipeline/controllers/interviewController.ts
import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handle, actorOf, ok } from '../http';
import * as interviewService from '../services/interviewService';
import * as offerService from '../services/offerService';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

export const scheduleInterview = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = req.body;
  const interview = await interviewService.scheduleInterview(actor.tenantId, actor.userId, data);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.CANDIDATE_PIPELINE_INTERVIEWS,
    action: Action.CREATE,
    actionLabel: `Scheduled interview "${interview.title}"`,
    entityType: EntityType.PIPELINE_INTERVIEW,
    entityId: interview.id,
    entityLabel: interview.title,
    afterData: { date: interview.date, type: interview.type },
  });
  ok(res, interview, 201);
});

export const evaluateInterview = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = { ...req.body, interview_id: req.params.id };
  await interviewService.submitEvaluation(actor.tenantId, actor.userId, data);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.CANDIDATE_PIPELINE_INTERVIEWS,
    action: Action.UPDATE,
    actionLabel: `Evaluated interview`,
    entityType: EntityType.PIPELINE_INTERVIEW,
    entityId: req.params.id,
    afterData: { status: data.status, rating: data.rating },
  });
  ok(res, { message: 'Evaluation submitted successfully' });
});

export const listCandidateInterviews = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const interviews = await interviewService.listCandidateInterviews(actor.tenantId, req.params.candidateId);
  ok(res, interviews);
});

export const generateOffer = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = req.body;
  const offer = await offerService.generateOffer(actor.tenantId, actor.userId, data);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.CANDIDATE_PIPELINE_OFFERS,
    action: Action.CREATE,
    actionLabel: `Generated offer for candidate`,
    entityType: EntityType.PIPELINE_OFFER,
    entityId: offer.id,
    afterData: { status: offer.status, expires_at: offer.expires_at },
  });
  ok(res, offer, 201);
});

export const listCandidateOffers = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const offers = await offerService.listCandidateOffers(actor.tenantId, req.params.candidateId);
  ok(res, offers);
});
