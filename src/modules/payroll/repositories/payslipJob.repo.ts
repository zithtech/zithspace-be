// src/modules/payroll/repositories/payslipJob.repo.ts
//
// Raw-SQL data access for the async payslip-generation job tables:
//   pay_payslip_jobs       — one header row per run (counts + status)
//   pay_payslip_job_items  — one row per employee (claim state / attempts / error)
// The DB is the source of truth for progress + resume. Every query filters
// tenant_id explicitly (belt-and-suspenders alongside RLS).

import { TenantClient } from '../db/pool';

export type PayslipJobStatus = 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed';
export type PayslipItemStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface PayslipJob {
  id: string;
  tenantId: string;
  runId: string;
  status: PayslipJobStatus;
  total: number;
  succeeded: number;
  failed: number;
  requestedBy: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
}
export interface PayslipJobItem {
  employeeId: string;
  status: PayslipItemStatus;
  attempts: number;
  error: string | null;
  payslipId: string | null;
  updatedAt: Date;
}

function mapJob(r: any): PayslipJob {
  return {
    id: r.id, tenantId: r.tenant_id, runId: r.run_id, status: r.status,
    total: Number(r.total), succeeded: Number(r.succeeded), failed: Number(r.failed),
    requestedBy: r.requested_by, startedAt: r.started_at, finishedAt: r.finished_at, updatedAt: r.updated_at,
  };
}

// ── header ──────────────────────────────────────────────────────────────────
/** Create/reset the run's job header for a fresh full generation. */
export async function startHeader(client: TenantClient, runId: string, requestedBy: string, total: number): Promise<PayslipJob> {
  const { rows } = await client.query(
    `INSERT INTO pay_payslip_jobs (tenant_id, run_id, status, total, succeeded, failed, requested_by, started_at, finished_at, updated_at)
     VALUES ($1, $2, 'queued', $3, 0, 0, $4, now(), NULL, now())
     ON CONFLICT (run_id) DO UPDATE SET
       status = 'queued', total = EXCLUDED.total, succeeded = 0, failed = 0,
       requested_by = EXCLUDED.requested_by, started_at = now(), finished_at = NULL, updated_at = now()
     RETURNING *`,
    [client.tenantId, runId, total, requestedBy]
  );
  return mapJob(rows[0]);
}

/** Mark the header running again (resume — counts are preserved, recomputed later). */
export async function markHeaderRunning(client: TenantClient, runId: string): Promise<void> {
  await client.query(
    `UPDATE pay_payslip_jobs SET status = 'running', finished_at = NULL, updated_at = now()
       WHERE tenant_id = $1 AND run_id = $2`,
    [client.tenantId, runId]
  );
}

export async function findJob(client: TenantClient, runId: string): Promise<PayslipJob | null> {
  const { rows } = await client.query(`SELECT * FROM pay_payslip_jobs WHERE tenant_id = $1 AND run_id = $2`, [client.tenantId, runId]);
  return rows[0] ? mapJob(rows[0]) : null;
}

/** Recompute succeeded/failed + overall status from the items; sets finished_at
 *  when nothing is left pending/processing. Returns the refreshed header. */
export async function refreshHeader(client: TenantClient, runId: string): Promise<PayslipJob | null> {
  const { rows } = await client.query(
    `WITH c AS (
       SELECT
         count(*) FILTER (WHERE status = 'done')                     AS done,
         count(*) FILTER (WHERE status = 'failed')                   AS failed,
         count(*) FILTER (WHERE status IN ('pending', 'processing')) AS remaining
       FROM pay_payslip_job_items WHERE tenant_id = $1 AND run_id = $2
     )
     UPDATE pay_payslip_jobs j SET
       succeeded   = c.done,
       failed      = c.failed,
       status      = CASE WHEN c.remaining > 0 THEN 'running'
                          WHEN c.failed > 0    THEN 'completed_with_errors'
                          ELSE 'completed' END,
       finished_at = CASE WHEN c.remaining = 0 THEN now() ELSE NULL END,
       updated_at  = now()
     FROM c
     WHERE j.tenant_id = $1 AND j.run_id = $2
     RETURNING j.*`,
    [client.tenantId, runId]
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

// ── items ───────────────────────────────────────────────────────────────────
/** Seed (or reset to pending) one item per employee for a full generation. */
export async function seedItems(client: TenantClient, runId: string, employeeIds: string[]): Promise<void> {
  if (employeeIds.length === 0) return;
  await client.query(
    `INSERT INTO pay_payslip_job_items (tenant_id, run_id, employee_id, status, attempts, error, updated_at)
     SELECT $1, $2, e::uuid, 'pending', 0, NULL, now() FROM unnest($3::uuid[]) AS e
     ON CONFLICT (run_id, employee_id) DO UPDATE SET status = 'pending', error = NULL, updated_at = now()`,
    [client.tenantId, runId, employeeIds]
  );
}

/** Employee ids for items that still need work (anything not 'done'). */
export async function pendingEmployeeIds(client: TenantClient, runId: string): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT employee_id FROM pay_payslip_job_items WHERE tenant_id = $1 AND run_id = $2 AND status <> 'done'`,
    [client.tenantId, runId]
  );
  return rows.map((r) => r.employee_id as string);
}

/** Reset non-done items to pending (for a resume — clears stale 'processing'/'failed'). */
export async function resetPendingToRetry(client: TenantClient, runId: string): Promise<void> {
  await client.query(
    `UPDATE pay_payslip_job_items SET status = 'pending', error = NULL, updated_at = now()
       WHERE tenant_id = $1 AND run_id = $2 AND status <> 'done'`,
    [client.tenantId, runId]
  );
}

export async function getItemStatus(client: TenantClient, runId: string, employeeId: string): Promise<PayslipItemStatus | null> {
  const { rows } = await client.query(
    `SELECT status FROM pay_payslip_job_items WHERE tenant_id = $1 AND run_id = $2 AND employee_id = $3`,
    [client.tenantId, runId, employeeId]
  );
  return rows[0]?.status ?? null;
}

export async function markProcessing(client: TenantClient, runId: string, employeeId: string): Promise<void> {
  await client.query(
    `UPDATE pay_payslip_job_items SET status = 'processing', attempts = attempts + 1, updated_at = now()
       WHERE tenant_id = $1 AND run_id = $2 AND employee_id = $3`,
    [client.tenantId, runId, employeeId]
  );
}
export async function markDone(client: TenantClient, runId: string, employeeId: string, payslipId: string): Promise<void> {
  await client.query(
    `UPDATE pay_payslip_job_items SET status = 'done', payslip_id = $4, error = NULL, updated_at = now()
       WHERE tenant_id = $1 AND run_id = $2 AND employee_id = $3`,
    [client.tenantId, runId, employeeId, payslipId]
  );
}
export async function markFailed(client: TenantClient, runId: string, employeeId: string, error: string): Promise<void> {
  await client.query(
    `UPDATE pay_payslip_job_items SET status = 'failed', error = $4, updated_at = now()
       WHERE tenant_id = $1 AND run_id = $2 AND employee_id = $3`,
    [client.tenantId, runId, employeeId, error.slice(0, 1000)]
  );
}

export async function listItems(client: TenantClient, runId: string): Promise<PayslipJobItem[]> {
  const { rows } = await client.query(
    `SELECT employee_id, status, attempts, error, payslip_id, updated_at
       FROM pay_payslip_job_items WHERE tenant_id = $1 AND run_id = $2`,
    [client.tenantId, runId]
  );
  return rows.map((r) => ({
    employeeId: r.employee_id, status: r.status, attempts: Number(r.attempts),
    error: r.error, payslipId: r.payslip_id, updatedAt: r.updated_at,
  }));
}
