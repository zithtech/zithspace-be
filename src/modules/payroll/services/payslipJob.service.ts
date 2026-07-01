// src/modules/payroll/services/payslipJob.service.ts
//
// Orchestrates ASYNC payslip generation: seeds the job header + per-employee
// items, fans jobs onto the BullMQ queue, and reports progress. The heavy PDF
// work happens in payslipWorker.ts. "Resume" (Complete pending) re-enqueues the
// employees that aren't done yet.

import { withTenant } from '../db/pool';
import * as runRepo from '../repositories/payRun.repo';
import * as jobRepo from '../repositories/payslipJob.repo';
import { enqueuePayslipJobs } from '../jobs/payslipQueue';
import { Actor, PayrollError } from '../types';

export interface PayslipJobStatusView {
  job: jobRepo.PayslipJob | null;
  items: jobRepo.PayslipJobItem[];
}

/** Start (or restart) full payslip generation for a finalized/paid run. */
export async function enqueueGeneration(actor: Actor, runId: string): Promise<jobRepo.PayslipJob> {
  const header = await withTenant(actor.tenantId, async (client) => {
    const run = await runRepo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');
    if (run.status !== 'finalized' && run.status !== 'paid') {
      throw PayrollError.badRequest('Finalize the run before generating payslips');
    }
    const items = await runRepo.findItems(client, runId);
    if (items.length === 0) throw PayrollError.badRequest('Run has no items');
    const employeeIds = items.map((i) => i.employeeId);

    const h = await jobRepo.startHeader(client, runId, actor.userId, employeeIds.length);
    await jobRepo.seedItems(client, runId, employeeIds);
    return { header: h, employeeIds };
  });

  await enqueuePayslipJobs(runId, actor.tenantId, actor.userId, header.employeeIds);
  return header.header;
}

/** Re-enqueue every employee that isn't done yet (the "Complete pending" action). */
export async function enqueuePending(actor: Actor, runId: string): Promise<jobRepo.PayslipJob> {
  const result = await withTenant(actor.tenantId, async (client) => {
    const job = await jobRepo.findJob(client, runId);
    if (!job) throw PayrollError.badRequest('No generation to resume — start payslip generation first');
    await jobRepo.resetPendingToRetry(client, runId);
    await jobRepo.markHeaderRunning(client, runId);
    const employeeIds = await jobRepo.pendingEmployeeIds(client, runId);
    const refreshed = await jobRepo.findJob(client, runId);
    return { employeeIds, refreshed: refreshed ?? job };
  });

  await enqueuePayslipJobs(runId, actor.tenantId, actor.userId, result.employeeIds);
  return result.refreshed;
}

/** Header counts + per-employee item statuses for the progress UI. */
export async function getStatus(actor: Actor, runId: string): Promise<PayslipJobStatusView> {
  return withTenant(actor.tenantId, async (client) => {
    const job = await jobRepo.findJob(client, runId);
    const items = job ? await jobRepo.listItems(client, runId) : [];
    return { job, items };
  });
}
