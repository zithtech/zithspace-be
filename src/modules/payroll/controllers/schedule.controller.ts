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
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

// ── Schedules ──────────────────────────────────────────────────────────────
export const listSchedules = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const search = req.query.search ? String(req.query.search) : undefined;

  const { data, total } = await scheduleService.listSchedules(actorOf(req), { includeInactive, page, limit, search });
  res.json({
    success: true,
    data,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

export const getSchedule = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await scheduleService.getSchedule(actorOf(req), req.params.id));
});

export const createSchedule = handle(async (req: AuthRequest, res: Response) => {
  const input = createScheduleSchema.parse(req.body);
  const schedule = await scheduleService.createSchedule(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PAY_SCHEDULES,
    action: Action.CREATE,
    actionLabel: `Created pay schedule "${schedule.name}"`,
    entityType: EntityType.PAYROLL_SCHEDULE,
    entityId: schedule.id,
    entityLabel: schedule.name,
  });
  ok(res, schedule, 201);
});

export const updateSchedule = handle(async (req: AuthRequest, res: Response) => {
  const input = updateScheduleSchema.parse(req.body);
  const schedule = await scheduleService.updateSchedule(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PAY_SCHEDULES,
    action: Action.UPDATE,
    actionLabel: `Updated pay schedule "${schedule.name}"`,
    entityType: EntityType.PAYROLL_SCHEDULE,
    entityId: schedule.id,
    entityLabel: schedule.name,
  });
  ok(res, schedule);
});

export const removeSchedule = handle(async (req: AuthRequest, res: Response) => {
  await scheduleService.deleteSchedule(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PAY_SCHEDULES,
    action: Action.DELETE,
    actionLabel: `Deleted pay schedule`,
    entityType: EntityType.PAYROLL_SCHEDULE,
    entityId: req.params.id,
  });
  ok(res, { id: req.params.id, deleted: true });
});

// ── Groups ─────────────────────────────────────────────────────────────────
export const listGroups = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const search = req.query.search ? String(req.query.search) : undefined;

  const { data, total } = await groupService.listGroups(actorOf(req), { includeInactive, page, limit, search });
  res.json({
    success: true,
    data,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

export const getGroup = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await groupService.getGroup(actorOf(req), req.params.id));
});

export const createGroup = handle(async (req: AuthRequest, res: Response) => {
  const input = createGroupSchema.parse(req.body);
  const group = await groupService.createGroup(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PAY_SCHEDULES,
    action: Action.CREATE,
    actionLabel: `Created pay group "${group.name}"`,
    entityType: EntityType.PAYROLL_SCHEDULE,
    entityId: group.id,
    entityLabel: group.name,
  });
  ok(res, group, 201);
});

export const updateGroup = handle(async (req: AuthRequest, res: Response) => {
  const input = updateGroupSchema.parse(req.body);
  const group = await groupService.updateGroup(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PAY_SCHEDULES,
    action: Action.UPDATE,
    actionLabel: `Updated pay group "${group.name}"`,
    entityType: EntityType.PAYROLL_SCHEDULE,
    entityId: group.id,
    entityLabel: group.name,
  });
  ok(res, group);
});

export const removeGroup = handle(async (req: AuthRequest, res: Response) => {
  await groupService.deleteGroup(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_PAY_SCHEDULES,
    action: Action.DELETE,
    actionLabel: `Deleted pay group`,
    entityType: EntityType.PAYROLL_SCHEDULE,
    entityId: req.params.id,
  });
  ok(res, { id: req.params.id, deleted: true });
});
