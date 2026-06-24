// src/modules/leave-v2/controllers/leaveType.controller.ts
// Thin HTTP layer: validate input → call service → shape response.
// No business logic here.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/leaveType.service';
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
} from '../validators/leaveType.validator';

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createLeaveTypeSchema.parse(req.body);
  const leaveType = await service.createLeaveType(actorOf(req), input);
  ok(res, leaveType, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const leaveTypes = await service.listLeaveTypes(actorOf(req), { includeInactive });
  ok(res, leaveTypes);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const leaveType = await service.getLeaveType(actorOf(req), req.params.id);
  ok(res, leaveType);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateLeaveTypeSchema.parse(req.body);
  const leaveType = await service.updateLeaveType(actorOf(req), req.params.id, input);
  ok(res, leaveType);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteLeaveType(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});
