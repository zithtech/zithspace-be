// src/modules/payroll/jobs/payslipQueue.ts
//
// BullMQ queue for async payslip generation. Payslips are fanned out ONE JOB PER
// EMPLOYEE so progress is exact (150/250), failures are per-payslip, and
// "Complete pending" just re-enqueues the not-done employees. Workers process
// jobs concurrently and idempotently (the DB item-status is the source of truth).
//
// The queue + its Redis connection are created LAZILY — nothing opens Redis until
// async payslips are actually used (gated by PAYROLL_ASYNC_PAYSLIPS). Mirrors the
// leave-v2 accrual queue.

import { Queue } from 'bullmq';

export const PAYSLIP_QUEUE = 'payroll-payslips';

export interface PayslipJobData {
  tenantId: string;
  runId: string;
  employeeId: string;
  requestedBy: string | null;
}

/** Redis connection for BullMQ — REDIS_URL (rediss:// = TLS) or discrete host/port. */
function buildConnection() {
  const base = { maxRetriesPerRequest: null as null };
  const url = process.env.REDIS_URL;
  if (url) {
    const u = new URL(url);
    return {
      ...base,
      host: u.hostname,
      port: parseInt(u.port || '6379'),
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    };
  }
  return {
    ...base,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

export const connection = buildConnection();

let _queue: Queue<PayslipJobData> | null = null;

/** Lazily create the queue (opens a Redis connection only on first use). */
export function getPayslipQueue(): Queue<PayslipJobData> {
  if (!_queue) {
    _queue = new Queue<PayslipJobData>(PAYSLIP_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 3_600, count: 2000 },
        removeOnFail: { age: 7 * 86_400, count: 2000 },
      },
    });
  }
  return _queue;
}

/**
 * Enqueue one payslip job per employee. jobId = run:employee so BullMQ never runs
 * the same employee concurrently; a fresh enqueue after removeOnComplete reuses it.
 */
export async function enqueuePayslipJobs(runId: string, tenantId: string, requestedBy: string | null, employeeIds: string[]): Promise<void> {
  if (employeeIds.length === 0) return;
  const q = getPayslipQueue();
  await q.addBulk(
    employeeIds.map((employeeId) => ({
      name: 'payslip',
      data: { tenantId, runId, employeeId, requestedBy },
      opts: { jobId: `${runId}_${employeeId}` },
    }))
  );
}
