// src/modules/leave-v2/jobs/accrualWorker.ts
//
// BullMQ worker for leave accrual. Handles two job types on one queue:
//   • 'dispatch' — the monthly cron tick: enumerate tenants, fan out 'tenant' jobs
//   • 'tenant'   — run accrual for one tenant (idempotent ledger writes)
//
// Concurrency spreads tenant jobs across the pool; failures retry with backoff
// and never block other tenants.

import { Worker, Job } from 'bullmq';
import {
  ACCRUAL_QUEUE,
  connection,
  enqueueTenantAccrual,
  listActiveTenantIds,
} from './accrualQueue';
import { runAccrualForTenant } from '../services/accrual.service';
import { runLapsingForTenant } from '../services/lapsing.service';

let worker: Worker | null = null;

async function processJob(job: Job): Promise<any> {
  if (job.name === 'dispatch') {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const tenantIds = await listActiveTenantIds();
    for (const tenantId of tenantIds) {
      await enqueueTenantAccrual(tenantId, year, month);
    }
    return { dispatched: tenantIds.length, year, month };
  }

  if (job.name === 'tenant') {
    const { tenantId, year, month } = job.data as { tenantId: string; year: number; month: number };
    
    // Calculate the 'asOf' date for lapsing (the day before the accrual run date, typically the last day of the month)
    const runDate = new Date(Date.UTC(year, month - 1, 1));
    const yesterday = new Date(runDate.getTime());
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    
    const lapseRes = await runLapsingForTenant(tenantId, { year: yesterday.getUTCFullYear(), month: yesterday.getUTCMonth() + 1, day: yesterday.getUTCDate() });
    const accrualRes = await runAccrualForTenant(tenantId, { year, month });
    
    return { lapse: lapseRes, accrual: accrualRes };
  }

  return { ignored: job.name };
}

export function startAccrualWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(ACCRUAL_QUEUE, processJob, {
    connection,
    concurrency: Number(process.env.LEAVE_ACCRUAL_CONCURRENCY ?? 5),
  });
  worker.on('completed', (job, result) => {
    console.log(`[leave-accrual] ${job.name} completed`, result);
  });
  worker.on('failed', (job, err) => {
    console.error(`[leave-accrual] ${job?.name} failed:`, err?.message);
  });
  return worker;
}
