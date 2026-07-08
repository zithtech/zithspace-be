// src/modules/payroll/services/payRun.service.ts
//
// Business logic for pay runs. Creating a run seeds one item per active
// assignment from its frozen breakdown and computes prorated pay. Items' LOP
// days are editable while the run is in draft; each edit recomputes that item
// and the run totals.

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/payRun.repo';
import * as workflowRepo from '../repositories/workflow.repo';
import { computeItem, daysInMonth, RunLineInput } from './payRunCalc';
import { Actor, PayRun, PayRunDetail, PayRunItem, PayRunLine, PayrollError } from '../types';
import { CreateRunInput, ProcessStepInput, UpdateItemInput } from '../validators/payRun.validator';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const round2 = (n: number) => Math.round(n * 100) / 100;

function lineToInput(l: PayRunLine): RunLineInput {
  return { componentId: l.componentId, code: l.code, name: l.name, category: l.category, isProRata: l.isProRata, fullAmount: l.fullAmount };
}

export async function createRun(actor: Actor, input: CreateRunInput): Promise<PayRunDetail> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsRun(client, input.year, input.month, null)) {
      throw PayrollError.conflict(`A pay run for ${MONTHS[input.month - 1]} ${input.year} already exists`);
    }

    const snaps = await repo.findActiveAssignmentSnapshots(client);
    if (snaps.length === 0) {
      throw PayrollError.badRequest('No employees have an active salary assignment to run payroll for');
    }

    // Group snapshot rows by employee.
    const byEmployee = new Map<string, { assignmentId: string; monthlyCtc: number; structureName: string | null; lines: RunLineInput[] }>();
    for (const s of snaps) {
      let g = byEmployee.get(s.employeeId);
      if (!g) { g = { assignmentId: s.assignmentId, monthlyCtc: s.monthlyCtc, structureName: s.structureName, lines: [] }; byEmployee.set(s.employeeId, g); }
      g.lines.push({ componentId: s.componentId, code: s.code, name: s.name, category: s.category, isProRata: s.isProRata, fullAmount: s.fullAmount });
    }

    const totalDays = daysInMonth(input.year, input.month);
    const run = await repo.insertRun(client, {
      payGroupId: null,
      payGroupName: 'All employees',
      month: input.month,
      year: input.year,
      periodLabel: `${MONTHS[input.month - 1]} ${input.year}`,
      totalDays,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    });

    let tGross = 0, tDed = 0, tNet = 0, count = 0;
    for (const [employeeId, g] of byEmployee) {
      const c = computeItem(totalDays, 0, g.lines);
      await repo.insertItem(client, {
        runId: run.id, employeeId, assignmentId: g.assignmentId, structureName: g.structureName,
        monthlyCtc: g.monthlyCtc, totalDays, lopDays: 0, paidDays: c.paidDays,
        gross: c.gross, totalDeductions: c.totalDeductions, net: c.net, lopDeduction: c.lopDeduction,
        components: c.lines as PayRunLine[],
      });
      tGross += c.gross; tDed += c.totalDeductions; tNet += c.net; count++;
    }
    await repo.updateRunTotals(client, run.id, {
      employeeCount: count, totalGross: round2(tGross), totalDeductions: round2(tDed), totalNet: round2(tNet), actorId: actor.userId,
    });

    return buildDetail(client, run.id);
  });
}

export async function listRuns(actor: Actor): Promise<PayRun[]> {
  return withTenant(actor.tenantId, (client) => repo.listRuns(client));
}

export async function getRun(actor: Actor, id: string): Promise<PayRunDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await repo.findRunById(client, id);
    if (!run) throw PayrollError.notFound('Pay run');
    return buildDetail(client, id);
  });
}

export async function updateItem(actor: Actor, runId: string, itemId: string, input: UpdateItemInput): Promise<PayRunDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await repo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'draft') throw PayrollError.badRequest('Only draft runs can be edited');

    const item = await repo.findItemById(client, itemId);
    if (!item || item.runId !== runId) throw PayrollError.notFound('Pay run item');

    const c = computeItem(item.totalDays, input.lopDays, item.components.map(lineToInput));
    await repo.updateItemComputed(client, itemId, {
      lopDays: c.lopDays, paidDays: c.paidDays, gross: c.gross, totalDeductions: c.totalDeductions,
      net: c.net, lopDeduction: c.lopDeduction, components: c.lines as PayRunLine[], notes: input.notes ?? null,
    });

    await recomputeRunTotals(client, runId, actor.userId);
    return buildDetail(client, runId);
  });
}

export interface LopSyncResult {
  detail: PayRunDetail;
  syncedEmployees: number;
  totalLopDays: number;
}

/**
 * Pull approved unpaid-leave (LOP) days and paid cash-advances from external modules
 * (leave-v2, reimbursement-v2) for the run's month and apply them to each item, recomputing pay. 
 * Authoritative: overwrites existing LOP and Advance deductions. Draft-only.
 */
export async function syncExternalData(actor: Actor, runId: string): Promise<LopSyncResult> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await repo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'draft') throw PayrollError.badRequest('Only draft runs can be synced');

    let lopRows: { userId: string; lopDays: number }[];
    let advanceRows: { userId: string; advanceAmount: number }[];
    try {
      [lopRows, advanceRows] = await Promise.all([
        repo.findMonthlyLop(client, run.year, run.month),
        repo.findMonthlyAdvances(client, run.year, run.month)
      ]);
    } catch (err) {
      console.error('[payroll] External sync — query failed:', err);
      throw PayrollError.badRequest('Could not read external data (leaves/advances) for sync');
    }
    const lopMap = new Map(lopRows.map((r) => [r.userId, r.lopDays]));
    const advanceMap = new Map(advanceRows.map((r) => [r.userId, r.advanceAmount]));

    const items = await repo.findItems(client, runId);
    let syncedEmployees = 0;
    let totalLopDays = 0;
    for (const it of items) {
      const lop = Math.min(lopMap.get(it.employeeId) ?? 0, it.totalDays);
      const advanceAmount = advanceMap.get(it.employeeId) ?? 0;
      
      // Filter out any previous 'ADVREC' lines to keep sync idempotent
      const baseComponents = it.components.filter(c => c.code !== 'ADVREC');
      
      if (advanceAmount > 0) {
        baseComponents.push({
          componentId: 'synthetic-advance-recovery',
          code: 'ADVREC',
          name: 'Advance Recovery',
          category: 'deduction',
          isProRata: false,
          fullAmount: advanceAmount,
          amount: advanceAmount
        });
      }

      const c = computeItem(it.totalDays, lop, baseComponents.map(lineToInput));
      await repo.updateItemComputed(client, it.id, {
        lopDays: c.lopDays, paidDays: c.paidDays, gross: c.gross, totalDeductions: c.totalDeductions,
        net: c.net, lopDeduction: c.lopDeduction, components: c.lines as PayRunLine[],
      });
      if (lop > 0 || advanceAmount > 0) { syncedEmployees++; totalLopDays += lop; }
    }
    await recomputeRunTotals(client, runId, actor.userId);
    return { detail: await buildDetail(client, runId), syncedEmployees, totalLopDays: round2(totalLopDays) };
  });
}

/** Lock an approved run — it becomes immutable (no edits/delete/resubmit). */
export async function finalizeRun(actor: Actor, runId: string): Promise<PayRunDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await repo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'approved') throw PayrollError.badRequest('Only approved runs can be finalized');
    await repo.finalizeRun(client, runId, actor.userId);
    await repo.insertApproval(client, { runId, stepNumber: run.totalSteps, action: 'finalized', performedBy: actor.userId, remarks: null });
    return buildDetail(client, runId);
  });
}

/** Mark a finalized run as paid (disbursement complete). Terminal state. */
export async function markRunPaid(actor: Actor, runId: string): Promise<PayRunDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await repo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'finalized') throw PayrollError.badRequest('Only finalized runs can be marked paid');
    await repo.markPaid(client, runId, actor.userId);
    await repo.insertApproval(client, { runId, stepNumber: run.totalSteps, action: 'paid', performedBy: actor.userId, remarks: null });
    return buildDetail(client, runId);
  });
}

export async function deleteRun(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await repo.findRunById(client, id);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'draft') throw PayrollError.badRequest('Only draft runs can be deleted');
    await repo.deleteRun(client, id);
  });
}

// ── internals ──────────────────────────────────────────────────────────────
async function recomputeRunTotals(client: TenantClient, runId: string, actorId: string): Promise<void> {
  const items = await repo.findItems(client, runId);
  let g = 0, d = 0, n = 0;
  for (const it of items) { g += it.gross; d += it.totalDeductions; n += it.net; }
  await repo.updateRunTotals(client, runId, {
    employeeCount: items.length, totalGross: round2(g), totalDeductions: round2(d), totalNet: round2(n), actorId,
  });
}

async function buildDetail(client: TenantClient, runId: string): Promise<PayRunDetail> {
  const run = await repo.findRunById(client, runId);
  return {
    ...run!,
    items: await repo.findItems(client, runId),
    approvals: await repo.listApprovals(client, runId),
  } as PayRunDetail;
}

// ── Approval (Phase 3b) ───────────────────────────────────────────────────────

/** Submit a draft run into the tenant's default approval workflow. */
export async function submitRun(actor: Actor, runId: string): Promise<PayRunDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await repo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'draft') throw PayrollError.badRequest('Only draft runs can be submitted');
    if (run.employeeCount === 0) throw PayrollError.badRequest('Run has no employees to approve');

    // Default workflow defines the sign-off steps; fall back to a single step.
    const wf = await workflowRepo.findDefaultWorkflow(client);
    const totalSteps = wf && wf.stepCount > 0 ? wf.stepCount : 1;

    await repo.submitRun(client, runId, {
      workflowId: wf?.id ?? null,
      workflowName: wf?.name ?? 'Direct approval',
      totalSteps,
      actorId: actor.userId,
    });
    await repo.insertApproval(client, { runId, stepNumber: 0, action: 'submitted', performedBy: actor.userId, remarks: null });
    return buildDetail(client, runId);
  });
}

/** Approve or reject the run's current step. Approve advances; the final step
 *  approves the run. Reject sends it back to draft for correction. */
export async function processStep(actor: Actor, runId: string, input: ProcessStepInput): Promise<PayRunDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await repo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'pending_approval') throw PayrollError.badRequest('Run is not awaiting approval');

    if (input.action === 'reject') {
      await repo.insertApproval(client, { runId, stepNumber: run.currentStep, action: 'rejected', performedBy: actor.userId, remarks: input.remarks ?? null });
      await repo.setRunStep(client, runId, { status: 'draft', currentStep: 0, actorId: actor.userId });
      return buildDetail(client, runId);
    }

    // approve
    await repo.insertApproval(client, { runId, stepNumber: run.currentStep, action: 'approved', performedBy: actor.userId, remarks: input.remarks ?? null });
    if (run.currentStep >= run.totalSteps) {
      await repo.setRunStep(client, runId, { status: 'approved', currentStep: run.totalSteps, actorId: actor.userId });
    } else {
      await repo.setRunStep(client, runId, { status: 'pending_approval', currentStep: run.currentStep + 1, actorId: actor.userId });
    }
    return buildDetail(client, runId);
  });
}
