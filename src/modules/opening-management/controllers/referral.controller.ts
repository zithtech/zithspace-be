import { Response } from 'express';
import { handle, ok, actorOf } from '../http';
import { AuthRequest } from '@/types';
import * as service from '../services/referral.service';
import { CreateReferralSchema } from '../validators/referral.validator';
import { CreateReferralInput } from '../types';

export const createReferral = handle(async (req: AuthRequest, res: Response) => {
  const input = CreateReferralSchema.parse(req.body) as CreateReferralInput;
  const referral = await service.createReferral(actorOf(req), req.params.id, input);
  ok(res, referral, 201);
});

export const listReferrals = handle(async (req: AuthRequest, res: Response) => {
  const referrals = await service.listReferrals(actorOf(req), req.params.id);
  ok(res, referrals);
});

export const markConverted = handle(async (req: AuthRequest, res: Response) => {
  const referral = await service.markConverted(actorOf(req), req.params.id, req.params.refId);
  ok(res, referral);
});

export const deleteReferral = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteReferral(actorOf(req), req.params.refId);
  ok(res, { success: true });
});
