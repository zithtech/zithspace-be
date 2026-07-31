// src/modules/payroll/controllers/payRun.controller.ts
// Thin HTTP layer for pay runs.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/payRun.service';
import * as payslipService from '../services/payslip.service';
import * as payslipJobService from '../services/payslipJob.service';
import * as bankFileService from '../services/bankFile.service';
import { createRunSchema, updateItemSchema, processStepSchema } from '../validators/payRun.validator';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

// NB: this module exports a handler named `process`, which shadows Node's global
// `process` in module scope — so read env via globalThis.
const asyncPayslipsEnabled = () => globalThis.process.env.PAYROLL_ASYNC_PAYSLIPS === 'true';

export const list = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listRuns(actorOf(req)));
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getRun(actorOf(req), req.params.id));
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const run = await service.createRun(actorOf(req), createRunSchema.parse(req.body));
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_RUN_PAYROLL,
    action: Action.CREATE,
    actionLabel: `Created payroll run`,
    entityType: EntityType.PAYROLL_RUN,
    entityId: run.id,
  });
  ok(res, run, 201);
});

export const updateItem = handle(async (req: AuthRequest, res: Response) => {
  const input = updateItemSchema.parse(req.body);
  const result = await service.updateItem(actorOf(req), req.params.id, req.params.itemId, input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_RUN_PAYROLL,
    action: Action.UPDATE,
    actionLabel: `Updated payroll run item`,
    entityType: EntityType.PAYROLL_RUN,
    entityId: req.params.id,
  });
  ok(res, result);
});

export const syncLop = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.syncLopFromLeaves(actorOf(req), req.params.id));
});

export const submit = handle(async (req: AuthRequest, res: Response) => {
  const run = await service.submitRun(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_RUN_PAYROLL,
    action: Action.SUBMIT,
    actionLabel: `Submitted payroll run`,
    entityType: EntityType.PAYROLL_RUN,
    entityId: req.params.id,
  });
  ok(res, run);
});

export const process = handle(async (req: AuthRequest, res: Response) => {
  const input = processStepSchema.parse(req.body);
  const run = await service.processStep(actorOf(req), req.params.id, input);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_RUN_PAYROLL,
    action: Action.UPDATE,
    actionLabel: `Processed step in payroll run`,
    entityType: EntityType.PAYROLL_RUN,
    entityId: req.params.id,
  });
  ok(res, run);
});

export const finalize = handle(async (req: AuthRequest, res: Response) => {
  const run = await service.finalizeRun(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_RUN_PAYROLL,
    action: Action.COMPLETE,
    actionLabel: `Finalized payroll run`,
    entityType: EntityType.PAYROLL_RUN,
    entityId: req.params.id,
  });
  ok(res, run);
});

export const markPaid = handle(async (req: AuthRequest, res: Response) => {
  const run = await service.markRunPaid(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_RUN_PAYROLL,
    action: Action.UPDATE,
    actionLabel: `Marked payroll run as paid`,
    entityType: EntityType.PAYROLL_RUN,
    entityId: req.params.id,
  });
  ok(res, run);
});

// ── Payslips ─────────────────────────────────────────────────────────────────
// When async is enabled, this enqueues one job per employee and returns the job
// header (202). Otherwise it renders inline (legacy path) and returns 201.
export const generatePayslips = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  if (asyncPayslipsEnabled()) {
    ok(res, await payslipJobService.enqueueGeneration(actor, req.params.id), 202);
  } else {
    ok(res, await payslipService.generateForRun(actor, req.params.id), 201);
  }
});

// "Complete pending" — re-enqueue every employee whose payslip isn't done yet.
export const resumePayslips = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await payslipJobService.enqueuePending(actorOf(req), req.params.id), 202);
});

// Progress for the async generation (header counts + per-employee statuses).
export const payslipStatus = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await payslipJobService.getStatus(actorOf(req), req.params.id));
});

export const listPayslips = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await payslipService.listForRun(actorOf(req), req.params.id));
});

// ── Bank file ────────────────────────────────────────────────────────────────
export const generateBankFile = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await bankFileService.generateForRun(actorOf(req), req.params.id), 201);
});

export const getBankFile = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await bankFileService.getForRun(actorOf(req), req.params.id));
});

// ── Self-service ─────────────────────────────────────────────────────────────
// Any authenticated user can read THEIR OWN payslips. The query is keyed to the
// actor's userId, so a user can never see another employee's payslips.
export const myPayslips = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  ok(res, await payslipService.listForEmployee(actor, actor.userId));
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteRun(actorOf(req), req.params.id);
  recordTransaction({
    req,
    section: Section.FINANCE,
    module: Module.PAYROLL_V2,
    page: Page.PAYROLL_V2_RUN_PAYROLL,
    action: Action.DELETE,
    actionLabel: `Deleted payroll run`,
    entityType: EntityType.PAYROLL_RUN,
    entityId: req.params.id,
  });
  ok(res, { id: req.params.id, deleted: true });
});
