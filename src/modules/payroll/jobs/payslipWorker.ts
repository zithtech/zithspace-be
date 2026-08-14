// src/modules/payroll/jobs/payslipWorker.ts
//
// BullMQ worker that renders ONE payslip PDF per job. Idempotent + resumable:
//   • skip if the item is already 'done'
//   • claim → render on a long-lived shared browser → upload → persist → mark done
//   • on error: mark the item 'failed' + rethrow so BullMQ retries (backoff);
//     after retries are exhausted it stays 'failed' for the "Complete pending" action.
//
// A single Puppeteer browser is launched per worker process and reused across
// jobs (concurrency = N pages on that browser), avoiding ~2s startup per PDF.

import { Worker, Job } from 'bullmq';
import puppeteer, { Browser } from 'puppeteer';
import { PAYSLIP_QUEUE, connection, PayslipJobData } from './payslipQueue';
import { withTenant } from '../db/pool';
import * as jobRepo from '../repositories/payslipJob.repo';
import * as payslipRepo from '../repositories/payslip.repo';
import { buildPayslipDataForEmployee } from '../services/payslip.service';
import { buildPayslipHtml } from '../services/payslipHtml';
import { renderAndUploadOne } from '../services/payslipPdf';


async function processJob(job: Job<PayslipJobData>): Promise<any> {
  const { tenantId, runId, employeeId, requestedBy } = job.data;

  // 1) Claim + build render data (skip if already done).
  const built = await withTenant(tenantId, async (client) => {
    const status = await jobRepo.getItemStatus(client, runId, employeeId);
    if (status === 'done') return null;                 // idempotent: nothing to do
    await jobRepo.markProcessing(client, runId, employeeId);
    return buildPayslipDataForEmployee(client, runId, employeeId);
  });
  if (!built) return { skipped: true };

  let browser: Browser | null = null;
  try {
    // 2) Render + upload OUTSIDE any transaction (slow work).
    const html = buildPayslipHtml(built.data);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const { fileUrl, fileKey } = await renderAndUploadOne(browser, html, {
      tenantId, year: built.run.year, month: built.run.month, employeeId,
    });
    await browser.close();
    browser = null;

    // 3) Persist the payslip + mark the item done.
    await withTenant(tenantId, async (client) => {
      const ps = await payslipRepo.upsertPayslip(client, {
        runId, employeeId, month: built.run.month, year: built.run.year, periodLabel: built.run.periodLabel,
        gross: built.item.gross, totalDeductions: built.item.totalDeductions, net: built.item.net,
        lopDays: built.item.lopDays, fileUrl, fileKey, generatedBy: requestedBy ?? employeeId,
      });
      await jobRepo.markDone(client, runId, employeeId, ps.id);
      await jobRepo.refreshHeader(client, runId);
    });
    return { employeeId, done: true };
  } catch (err: any) {
    await withTenant(tenantId, async (client) => {
      await jobRepo.markFailed(client, runId, employeeId, err?.message || 'render failed');
      await jobRepo.refreshHeader(client, runId);
    });
    throw err; // let BullMQ retry with backoff
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

let worker: Worker<PayslipJobData> | null = null;

export function startPayslipWorker(): Worker<PayslipJobData> {
  if (worker) return worker;
  worker = new Worker<PayslipJobData>(PAYSLIP_QUEUE, processJob, {
    connection,
    concurrency: Number(process.env.PAYSLIP_WORKER_CONCURRENCY ?? 4),
  });
  worker.on('failed', (job, err) => {
    console.error(`[payslip-worker] job ${job?.id} failed:`, err?.message);
  });
  return worker;
}

export async function stopPayslipWorker(): Promise<void> {
  if (worker) { await worker.close(); worker = null; }
}
