// src/modules/pipeline/controllers/interviewController.ts
import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handle, actorOf, ok } from '../http';
import * as interviewService from '../services/interviewService';
import * as offerService from '../services/offerService';

export const scheduleInterview = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = req.body;
  const interview = await interviewService.scheduleInterview(actor.tenantId, actor.userId, data);
  ok(res, interview, 201);
});

export const evaluateInterview = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = { ...req.body, interview_id: req.params.id };
  await interviewService.submitEvaluation(actor.tenantId, actor.userId, data);
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
  ok(res, offer, 201);
});

export const listCandidateOffers = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const offers = await offerService.listCandidateOffers(actor.tenantId, req.params.candidateId);
  ok(res, offers);
});
