// src/modules/leave-v2/controllers/leaveRequest.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/leaveRequest.service';
import { applyLeaveSchema } from '../validators/leaveRequest.validator';

export const myBalances = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getMyBalances(actorOf(req)));
});

export const myRequests = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listMyRequests(actorOf(req)));
});

export const holidayDates = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getHolidayDates(actorOf(req)));
});

export const apply = handle(async (req: AuthRequest, res: Response) => {
  const input = applyLeaveSchema.parse(req.body);
  ok(res, await service.applyLeave(actorOf(req), input), 201);
});

export const cancel = handle(async (req: AuthRequest, res: Response) => {
  await service.cancelMyRequest(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, cancelled: true });
});
