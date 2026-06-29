// src/modules/leave-v2/repositories/accrual.repo.ts
//
// Data access for the accrual engine. Reads policies (lv2_*) and resolves
// employees from the org tables (users ⋈ positions) — all within the same
// tenant transaction, so RLS keeps everything tenant-scoped.

import { TenantClient } from '../db/pool';
import { AccrualMethod, TermCycle } from '../types';

// ── Per-tenant leave settings ─────────────────────────────────────────────────
export async function getLeaveYearStartMonth(client: TenantClient): Promise<number> {
  const { rows } = await client.query(
    `SELECT leave_year_start_month FROM lv2_leave_settings WHERE tenant_id = $1`,
    [client.tenantId]
  );
  return rows[0] ? Number(rows[0].leave_year_start_month) : 1;
}

export async function upsertLeaveYearStartMonth(client: TenantClient, month: number): Promise<number> {
  const { rows } = await client.query(
    `INSERT INTO lv2_leave_settings (tenant_id, leave_year_start_month, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (tenant_id) DO UPDATE SET leave_year_start_month = EXCLUDED.leave_year_start_month, updated_at = now()
     RETURNING leave_year_start_month`,
    [client.tenantId, month]
  );
  return Number(rows[0].leave_year_start_month);
}

// ── Employee resolution (users ⋈ positions) ───────────────────────────────────
export interface ResolvedEmployee {
  userId: string;
  userName: string;
  employeeId: string;
  positionId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  gradeId: string | null;
  /** Join date (YYYY-MM-DD) for proration, or null if unknown → full grant. */
  joinDate: string | null;
}

export async function resolveEmployees(client: TenantClient): Promise<ResolvedEmployee[]> {
  // Leave keys on user_id. Every active user is a leave participant; their org
  // attributes (for policy scope matching) come from their position (if any).
  // Join date (best-effort) comes from employee_work_details for proration.
  const { rows } = await client.query(
    `SELECT u.id            AS user_id,
            u.name          AS user_name,
            u.position_id    AS position_id,
            p.department_id  AS department_id,
            p.sub_department_id AS sub_department_id,
            p.grade_id       AS grade_id,
            CASE WHEN ewd.work_joining_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
                 THEN ewd.work_joining_date END AS join_date
       FROM users u
       LEFT JOIN positions p ON p.id = u.position_id
       LEFT JOIN employee_work_details ewd ON ewd.employee_id = u.employee_id
      WHERE u.tenant_id = $1
        AND u.is_active = true`,
    [client.tenantId]
  );
  return rows.map((r) => ({
    userId: r.user_id,
    userName: r.user_name || '—',
    employeeId: r.user_id, // person key for the ledger = user id
    positionId: r.position_id,
    departmentId: r.department_id,
    subDepartmentId: r.sub_department_id,
    gradeId: r.grade_id,
    joinDate: r.join_date ?? null,
  }));
}

/** Existing accrual keys (`userId|leaveTypeId|periodKey`) — used by dry-run to predict skips. */
export async function getExistingAccrualKeys(client: TenantClient): Promise<Set<string>> {
  const { rows } = await client.query(
    `SELECT user_id, leave_type_id, period_key FROM lv2_leave_ledger
      WHERE tenant_id = $1 AND entry_type = 'accrual' AND period_key IS NOT NULL`,
    [client.tenantId]
  );
  return new Set(rows.map((r) => `${r.user_id}|${r.leave_type_id}|${r.period_key}`));
}

// ── Active policies (header + assignments + lines) for accrual ────────────────
export interface AccrualLine {
  leaveTypeId: string;
  accrualMethod: AccrualMethod;
  countPerPeriod: number;
  allocation: number;
}
export interface AccrualPolicy {
  id: string;
  termCycle: TermCycle;
  lopOnExhaustion: boolean;
  assignments: { scopeType: string; scopeId: string | null }[];
  lines: AccrualLine[];
}

export async function loadActivePolicies(client: TenantClient): Promise<AccrualPolicy[]> {
  const { rows: policyRows } = await client.query(
    `SELECT id, term_cycle, lop_on_exhaustion
       FROM lv2_leave_policies
      WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL`,
    [client.tenantId]
  );
  if (policyRows.length === 0) return [];

  const ids = policyRows.map((p) => p.id);
  const { rows: aRows } = await client.query(
    `SELECT policy_id, scope_type, scope_id FROM lv2_leave_policy_assignments
      WHERE tenant_id = $1 AND policy_id = ANY($2::uuid[])`,
    [client.tenantId, ids]
  );
  const { rows: lRows } = await client.query(
    `SELECT policy_id, leave_type_id, accrual_method, count_per_period, allocation
       FROM lv2_leave_policy_lines
      WHERE tenant_id = $1 AND policy_id = ANY($2::uuid[])`,
    [client.tenantId, ids]
  );

  const byId = new Map<string, AccrualPolicy>();
  for (const p of policyRows) {
    byId.set(p.id, { id: p.id, termCycle: p.term_cycle, lopOnExhaustion: p.lop_on_exhaustion, assignments: [], lines: [] });
  }
  for (const a of aRows) byId.get(a.policy_id)?.assignments.push({ scopeType: a.scope_type, scopeId: a.scope_id });
  for (const l of lRows)
    byId.get(l.policy_id)?.lines.push({
      leaveTypeId: l.leave_type_id,
      accrualMethod: l.accrual_method,
      countPerPeriod: Number(l.count_per_period),
      allocation: Number(l.allocation),
    });

  // Only policies that actually grant something.
  return [...byId.values()].filter((p) => p.lines.length > 0 && p.assignments.length > 0);
}

// ── Idempotent accrual credit ─────────────────────────────────────────────────
export interface AccrualCredit {
  employeeId: string;
  leaveTypeId: string;
  units: number;
  periodKey: string;
  policyId: string;
  effectiveDate: string; // YYYY-MM-DD
  note?: string;
}

/** Insert an accrual credit; returns true if a new row was written (false if it already existed). */
export async function insertAccrualCredit(client: TenantClient, c: AccrualCredit): Promise<boolean> {
  const { rowCount } = await client.query(
    `INSERT INTO lv2_leave_ledger
       (tenant_id, user_id, leave_type_id, entry_type, units, source, source_id, note, effective_date, period_key)
     VALUES ($1, $2, $3, 'accrual', $4, 'policy_accrual', $5, $6, $7, $8)
     ON CONFLICT (tenant_id, user_id, leave_type_id, period_key)
       WHERE entry_type = 'accrual' AND period_key IS NOT NULL
     DO NOTHING`,
    [client.tenantId, c.employeeId, c.leaveTypeId, c.units, c.policyId, c.note ?? null, c.effectiveDate, c.periodKey]
  );
  return rowCount > 0;
}
