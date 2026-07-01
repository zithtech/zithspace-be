// src/modules/payroll/controllers/assignment.controller.ts
// Thin HTTP layer for employee salary assignments.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/assignment.service';
import * as profileService from '../services/profile.service';
import { assignSchema, previewAssignSchema } from '../validators/assignment.validator';
import { upsertProfileSchema } from '../validators/profile.validator';

export const list = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listAssignments(actorOf(req)));
});

// Active assignment + frozen breakdown for one employee (null if none).
export const getForEmployee = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getByEmployee(actorOf(req), req.params.employeeId));
});

// Full revision history (active + superseded) for one employee.
export const getHistory = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getHistory(actorOf(req), req.params.employeeId));
});

export const assign = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.assign(actorOf(req), assignSchema.parse(req.body)), 201);
});

export const preview = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.previewAssignment(actorOf(req), previewAssignSchema.parse(req.body)));
});

export const revoke = handle(async (req: AuthRequest, res: Response) => {
  await service.revoke(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, revoked: true });
});

// ── Statutory & bank profiles ────────────────────────────────────────────────
export const listProfiles = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await profileService.listProfiles(actorOf(req)));
});
export const getProfile = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await profileService.getProfile(actorOf(req), req.params.employeeId));
});
export const upsertProfile = handle(async (req: AuthRequest, res: Response) => {
  const input = upsertProfileSchema.parse(req.body);
  ok(res, await profileService.upsertProfile(actorOf(req), req.params.employeeId, input));
});
