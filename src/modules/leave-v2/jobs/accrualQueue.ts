// src/modules/leave-v2/jobs/accrualQueue.ts
//
// BullMQ queue + scheduler for leave accrual. The cron does NOT do the work —
// it fans out one job per tenant onto the queue, where workers process them
// concurrently and idempotently. Scales by adding workers.
//
// IMPORTANT: the Queue (and its Redis connection) is created LAZILY. Nothing
// here opens a Redis connection until accrual is actually used (enabled via
// LEAVE_ACCRUAL_ENABLED). So the module never requires Redis when accrual is off.

import { Queue } from 'bullmq';
import { lv2Pool } from '../db/pool';

export const ACCRUAL_QUEUE = 'leave-accrual';

/**
 * Redis connection for BullMQ. Prefers a single REDIS_URL (how Dokploy / most
 * managed Redis expose it — `redis://[user:pass@]host:port`, or `rediss://` for
 * TLS), and falls back to discrete REDIS_HOST / REDIS_PORT / REDIS_PASSWORD.
 * `maxRetriesPerRequest: null` is required by BullMQ for its blocking worker
 * connection.
 */
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

let _queue: Queue | null = null;

/** Lazily create the queue (opens a Redis connection only on first use). */
export function getAccrualQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(ACCRUAL_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 86_400, count: 500 },
        removeOnFail: { age: 7 * 86_400, count: 1000 },
      },
    });
  }
  return _queue;
}

/** All active tenant ids (the scheduler fans accrual out across these). */
export async function listActiveTenantIds(): Promise<string[]> {
  const { rows } = await lv2Pool.query(`SELECT id FROM tenants WHERE is_active = true`);
  return rows.map((r) => r.id);
}

/** Enqueue accrual for a single tenant + period (jobId dedupes within the run). */
export async function enqueueTenantAccrual(tenantId: string, year: number, month: number): Promise<void> {
  await getAccrualQueue().add(
    'tenant',
    { tenantId, year, month },
    { jobId: `accrual:${tenantId}:${year}-${String(month).padStart(2, '0')}` }
  );
}

/**
 * Register the monthly dispatcher as a repeatable job. Runs on the 1st of every
 * month at 02:00; its processor (in the worker) fans out per-tenant jobs.
 */
export async function initAccrualScheduler(): Promise<void> {
  await getAccrualQueue().add(
    'dispatch',
    {},
    {
      repeat: { pattern: '0 2 1 * *' }, // 02:00 on day-of-month 1
      jobId: 'accrual-monthly-dispatch',
    }
  );
}
