// src/modules/leave-v2/controllers/leavePolicy.controller.ts
// Thin HTTP layer: validate input → call service → shape response.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/leavePolicy.service';
import {
  createLeavePolicySchema,
  updateLeavePolicySchema,
} from '../validators/leavePolicy.validator';

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createLeavePolicySchema.parse(req.body);
  const policy = await service.createPolicy(actorOf(req), input);
  ok(res, policy, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const policies = await service.listPolicies(actorOf(req), { includeInactive });
  ok(res, policies);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const policy = await service.getPolicy(actorOf(req), req.params.id);
  ok(res, policy);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateLeavePolicySchema.parse(req.body);
  const policy = await service.updatePolicy(actorOf(req), req.params.id, input);
  ok(res, policy);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deletePolicy(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});
