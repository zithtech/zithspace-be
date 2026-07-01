// src/modules/payroll/controllers/schedule.controller.ts
// Thin HTTP layer for Pay Schedules and Pay Groups.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as scheduleService from '../services/schedule.service';
import * as groupService from '../services/group.service';
import {
  createScheduleSchema,
  updateScheduleSchema,
  createGroupSchema,
  updateGroupSchema,
} from '../validators/schedule.validator';

// ── Schedules ──────────────────────────────────────────────────────────────
export const listSchedules = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  ok(res, await scheduleService.listSchedules(actorOf(req), { includeInactive }));
});

export const getSchedule = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await scheduleService.getSchedule(actorOf(req), req.params.id));
});

export const createSchedule = handle(async (req: AuthRequest, res: Response) => {
  const input = createScheduleSchema.parse(req.body);
  ok(res, await scheduleService.createSchedule(actorOf(req), input), 201);
});

export const updateSchedule = handle(async (req: AuthRequest, res: Response) => {
  const input = updateScheduleSchema.parse(req.body);
  ok(res, await scheduleService.updateSchedule(actorOf(req), req.params.id, input));
});

export const removeSchedule = handle(async (req: AuthRequest, res: Response) => {
  await scheduleService.deleteSchedule(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});

// ── Groups ─────────────────────────────────────────────────────────────────
export const listGroups = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  ok(res, await groupService.listGroups(actorOf(req), { includeInactive }));
});

export const getGroup = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await groupService.getGroup(actorOf(req), req.params.id));
});

export const createGroup = handle(async (req: AuthRequest, res: Response) => {
  const input = createGroupSchema.parse(req.body);
  ok(res, await groupService.createGroup(actorOf(req), input), 201);
});

export const updateGroup = handle(async (req: AuthRequest, res: Response) => {
  const input = updateGroupSchema.parse(req.body);
  ok(res, await groupService.updateGroup(actorOf(req), req.params.id, input));
});

export const removeGroup = handle(async (req: AuthRequest, res: Response) => {
  await groupService.deleteGroup(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});
