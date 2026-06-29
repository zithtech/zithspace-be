// src/modules/leave-v2/controllers/adjustment.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import { LeaveV2Error } from '../types';
import * as service from '../services/adjustment.service';
import { createAdjustmentSchema } from '../validators/adjustment.validator';

export const list = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listAdjustments(actorOf(req)));
});

export const employees = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getEmployeeOptions(actorOf(req)));
});

export const balance = handle(async (req: AuthRequest, res: Response) => {
  const { employeeId, leaveTypeId } = req.query as { employeeId?: string; leaveTypeId?: string };
  if (!employeeId || !leaveTypeId) throw LeaveV2Error.badRequest('employeeId and leaveTypeId are required');
  ok(res, await service.getBalance(actorOf(req), employeeId, leaveTypeId));
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createAdjustmentSchema.parse(req.body);
  ok(res, await service.createAdjustment(actorOf(req), input), 201);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.deleteAdjustment(actorOf(req), req.params.id));
});
