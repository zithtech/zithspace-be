// src/modules/payroll/repositories/payRun.repo.ts
//
// Raw-SQL data access for pay_runs and pay_run_items. Every query takes a
// tenant-scoped client AND filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import { ComponentCategory, PayRun, PayRunApproval, PayRunItem, PayRunLine, PayRunStatus } from '../types';

// ── Runs ──────────────────────────────────────────────────────────────────────
const RUN_COLS = `
  id, tenant_id, pay_group_id, pay_group_name, month, year, period_label, status,
  total_days, employee_count, total_gross, total_deductions, total_net,
  workflow_id, workflow_name, current_step, total_steps, notes,
  finalized_at, paid_at, created_by, updated_by, created_at, updated_at
`;

function mapRun(r: any): PayRun {
  return {
    id: r.id, tenantId: r.tenant_id, payGroupId: r.pay_group_id, payGroupName: r.pay_group_name,
    month: r.month, year: r.year, periodLabel: r.period_label, status: r.status,
    totalDays: r.total_days, employeeCount: r.employee_count,
    totalGross: Number(r.total_gross), totalDeductions: Number(r.total_deductions), totalNet: Number(r.total_net),
    workflowId: r.workflow_id, workflowName: r.workflow_name, currentStep: r.current_step, totalSteps: r.total_steps,
    notes: r.notes, finalizedAt: r.finalized_at, paidAt: r.paid_at,
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function existsRun(client: TenantClient, year: number, month: number, payGroupId: string | null): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM pay_runs
      WHERE tenant_id = $1 AND year = $2 AND month = $3
        AND COALESCE(pay_group_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      LIMIT 1`,
    [client.tenantId, year, month, payGroupId]
  );
  return (rowCount ?? 0) > 0;
}

export interface InsertRunData {
  payGroupId: string | null;
  payGroupName: string;
  month: number;
  year: number;
  periodLabel: string;
  totalDays: number;
  notes: string | null;
  createdBy: string;
}

export async function insertRun(client: TenantClient, d: InsertRunData): Promise<PayRun> {
  const { rows } = await client.query(
    `INSERT INTO pay_runs
       (tenant_id, pay_group_id, pay_group_name, month, year, period_label, total_days, notes, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     RETURNING ${RUN_COLS}`,
    [client.tenantId, d.payGroupId, d.payGroupName, d.month, d.year, d.periodLabel, d.totalDays, d.notes, d.createdBy]
  );
  return mapRun(rows[0]);
}

export async function listRuns(client: TenantClient): Promise<PayRun[]> {
  const { rows } = await client.query(
    `SELECT ${RUN_COLS} FROM pay_runs WHERE tenant_id = $1 ORDER BY year DESC, month DESC, created_at DESC`,
    [client.tenantId]
  );
  return rows.map(mapRun);
}

export async function findRunById(client: TenantClient, id: string): Promise<PayRun | null> {
  const { rows } = await client.query(`SELECT ${RUN_COLS} FROM pay_runs WHERE tenant_id = $1 AND id = $2`, [client.tenantId, id]);
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function updateRunTotals(
  client: TenantClient,
  id: string,
  t: { employeeCount: number; totalGross: number; totalDeductions: number; totalNet: number; actorId: string }
): Promise<void> {
  await client.query(
    `UPDATE pay_runs SET employee_count = $3, total_gross = $4, total_deductions = $5, total_net = $6, updated_by = $7, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id, t.employeeCount, t.totalGross, t.totalDeductions, t.totalNet, t.actorId]
  );
}

export async function updateRunStatus(client: TenantClient, id: string, status: PayRunStatus, actorId: string): Promise<void> {
  await client.query(
    `UPDATE pay_runs SET status = $3, updated_by = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id, status, actorId]
  );
}

export async function deleteRun(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(`DELETE FROM pay_runs WHERE tenant_id = $1 AND id = $2`, [client.tenantId, id]);
  return (rowCount ?? 0) > 0;
}

// Set a run into pending_approval with workflow tracking (on submit).
export async function submitRun(
  client: TenantClient,
  id: string,
  d: { workflowId: string | null; workflowName: string; totalSteps: number; actorId: string }
): Promise<void> {
  await client.query(
    `UPDATE pay_runs
        SET status = 'pending_approval', workflow_id = $3, workflow_name = $4,
            total_steps = $5, current_step = 1, updated_by = $6, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id, d.workflowId, d.workflowName, d.totalSteps, d.actorId]
  );
}

// Advance / reset a run's approval step + status.
export async function setRunStep(
  client: TenantClient,
  id: string,
  d: { status: PayRunStatus; currentStep: number; actorId: string }
): Promise<void> {
  await client.query(
    `UPDATE pay_runs SET status = $3, current_step = $4, updated_by = $5, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id, d.status, d.currentStep, d.actorId]
  );
}

export async function finalizeRun(client: TenantClient, id: string, actorId: string): Promise<void> {
  await client.query(
    `UPDATE pay_runs SET status = 'finalized', finalized_at = now(), finalized_by = $3, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id, actorId]
  );
}

export async function markPaid(client: TenantClient, id: string, actorId: string): Promise<void> {
  await client.query(
    `UPDATE pay_runs SET status = 'paid', paid_at = now(), paid_by = $3, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id, actorId]
  );
}

// ── Approvals (audit log) ─────────────────────────────────────────────────────
export async function insertApproval(
  client: TenantClient,
  d: { runId: string; stepNumber: number; action: 'submitted' | 'approved' | 'rejected' | 'finalized' | 'paid'; performedBy: string; remarks: string | null }
): Promise<void> {
  await client.query(
    `INSERT INTO pay_run_approvals (tenant_id, run_id, step_number, action, performed_by, remarks)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [client.tenantId, d.runId, d.stepNumber, d.action, d.performedBy, d.remarks]
  );
}

export async function listApprovals(client: TenantClient, runId: string): Promise<PayRunApproval[]> {
  const { rows } = await client.query(
    `SELECT id, run_id, step_number, action, performed_by, remarks, created_at
       FROM pay_run_approvals WHERE tenant_id = $1 AND run_id = $2 ORDER BY created_at ASC`,
    [client.tenantId, runId]
  );
  return rows.map((r) => ({
    id: r.id, runId: r.run_id, stepNumber: r.step_number, action: r.action,
    performedBy: r.performed_by, remarks: r.remarks, createdAt: r.created_at,
  }));
}

// ── Items ─────────────────────────────────────────────────────────────────────
const ITEM_COLS = `
  id, run_id, employee_id, assignment_id, structure_name, monthly_ctc, total_days,
  lop_days, paid_days, gross, total_deductions, net, lop_deduction, components, notes
`;

function mapItem(r: any): PayRunItem {
  return {
    id: r.id, runId: r.run_id, employeeId: r.employee_id, assignmentId: r.assignment_id,
    structureName: r.structure_name, monthlyCtc: Number(r.monthly_ctc), totalDays: r.total_days,
    lopDays: Number(r.lop_days), paidDays: Number(r.paid_days), gross: Number(r.gross),
    totalDeductions: Number(r.total_deductions), net: Number(r.net), lopDeduction: Number(r.lop_deduction),
    components: (r.components ?? []) as PayRunLine[], notes: r.notes,
  };
}

export interface InsertItemData {
  runId: string;
  employeeId: string;
  assignmentId: string | null;
  structureName: string | null;
  monthlyCtc: number;
  totalDays: number;
  lopDays: number;
  paidDays: number;
  gross: number;
  totalDeductions: number;
  net: number;
  lopDeduction: number;
  components: PayRunLine[];
}

export async function insertItem(client: TenantClient, d: InsertItemData): Promise<void> {
  await client.query(
    `INSERT INTO pay_run_items
       (tenant_id, run_id, employee_id, assignment_id, structure_name, monthly_ctc, total_days,
        lop_days, paid_days, gross, total_deductions, net, lop_deduction, components)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
    [
      client.tenantId, d.runId, d.employeeId, d.assignmentId, d.structureName, d.monthlyCtc, d.totalDays,
      d.lopDays, d.paidDays, d.gross, d.totalDeductions, d.net, d.lopDeduction, JSON.stringify(d.components),
    ]
  );
}

export async function findItems(client: TenantClient, runId: string): Promise<PayRunItem[]> {
  const { rows } = await client.query(
    `SELECT ${ITEM_COLS} FROM pay_run_items WHERE tenant_id = $1 AND run_id = $2 ORDER BY created_at ASC`,
    [client.tenantId, runId]
  );
  return rows.map(mapItem);
}

export async function findItemById(client: TenantClient, id: string): Promise<PayRunItem | null> {
  const { rows } = await client.query(`SELECT ${ITEM_COLS} FROM pay_run_items WHERE tenant_id = $1 AND id = $2`, [client.tenantId, id]);
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function findItemByEmployee(client: TenantClient, runId: string, employeeId: string): Promise<PayRunItem | null> {
  const { rows } = await client.query(
    `SELECT ${ITEM_COLS} FROM pay_run_items WHERE tenant_id = $1 AND run_id = $2 AND employee_id = $3`,
    [client.tenantId, runId, employeeId]
  );
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function updateItemComputed(
  client: TenantClient,
  id: string,
  d: { lopDays: number; paidDays: number; gross: number; totalDeductions: number; net: number; lopDeduction: number; components: PayRunLine[]; notes?: string | null }
): Promise<PayRunItem | null> {
  const { rows } = await client.query(
    `UPDATE pay_run_items
        SET lop_days = $3, paid_days = $4, gross = $5, total_deductions = $6, net = $7,
            lop_deduction = $8, components = $9::jsonb, notes = COALESCE($10, notes), updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      RETURNING ${ITEM_COLS}`,
    [client.tenantId, id, d.lopDays, d.paidDays, d.gross, d.totalDeductions, d.net, d.lopDeduction, JSON.stringify(d.components), d.notes ?? null]
  );
  return rows[0] ? mapItem(rows[0]) : null;
}

// Aggregate active employee assignments + frozen snapshot + each component's
// current is_pro_rata flag, for seeding a run. Returns flat rows (grouped by service).
export interface AssignmentSnapshotRow {
  assignmentId: string;
  employeeId: string;
  monthlyCtc: number;
  structureName: string | null;
  componentId: string;
  code: string;
  name: string;
  category: ComponentCategory;
  fullAmount: number;
  isProRata: boolean;
  displayOrder: number;
}

// Approved unpaid-leave (LOP) days per user for a month, from the leave-v2
// module's lv2_leave_requests (user_id = platform User.id, same key as payroll).
// Multi-month requests are clamped proportionally by calendar-day overlap so a
// request spanning months only contributes its in-month share.
export interface MonthlyLopRow {
  userId: string;
  lopDays: number;
}

export async function findMonthlyLop(client: TenantClient, year: number, month: number): Promise<MonthlyLopRow[]> {
  const { rows } = await client.query(
    `WITH mr AS (
       SELECT make_date($2, $3, 1) AS month_start,
              (make_date($2, $3, 1) + interval '1 month' - interval '1 day')::date AS month_end
     )
     SELECT r.user_id,
            SUM(
              r.lop_units * (
                (LEAST(r.to_date, mr.month_end) - GREATEST(r.from_date, mr.month_start) + 1)::numeric
                / NULLIF((r.to_date - r.from_date + 1), 0)
              )
            ) AS lop_days
       FROM lv2_leave_requests r
       CROSS JOIN mr
      WHERE r.tenant_id = $1
        AND r.status = 'approved'
        AND r.lop_units > 0
        AND r.from_date <= mr.month_end
        AND r.to_date >= mr.month_start
      GROUP BY r.user_id`,
    [client.tenantId, year, month]
  );
  return rows.map((r) => ({ userId: r.user_id, lopDays: Math.round(Number(r.lop_days) * 100) / 100 }));
}

export interface MonthlyAdvanceRow {
  userId: string;
  advanceAmount: number;
}

export async function findMonthlyAdvances(client: TenantClient, year: number, month: number): Promise<MonthlyAdvanceRow[]> {
  const { rows } = await client.query(
    `SELECT user_id, SUM(amount) AS total_advance
       FROM rb2_advances
      WHERE tenant_id = $1
        AND deleted_at IS NULL
        AND status = 'paid'
        AND EXTRACT(YEAR FROM paid_at) = $2
        AND EXTRACT(MONTH FROM paid_at) = $3
      GROUP BY user_id`,
    [client.tenantId, year, month]
  );
  return rows.map((r) => ({ userId: r.user_id, advanceAmount: Number(r.total_advance) }));
}

export async function findActiveAssignmentSnapshots(client: TenantClient): Promise<AssignmentSnapshotRow[]> {
  const { rows } = await client.query(
    `SELECT a.id AS assignment_id, a.employee_id, a.monthly_ctc, s.name AS structure_name,
            c.component_id, c.code, c.name AS comp_name, c.category, c.calculated_amount,
            COALESCE(pc.is_pro_rata, true) AS is_pro_rata, c.display_order
       FROM pay_employee_assignments a
       JOIN pay_employee_assignment_components c ON c.assignment_id = a.id AND c.tenant_id = a.tenant_id
       LEFT JOIN pay_structures s ON s.id = a.structure_id AND s.tenant_id = a.tenant_id
       LEFT JOIN pay_components pc ON pc.id = c.component_id AND pc.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND a.is_active = true
      ORDER BY a.employee_id, c.display_order ASC`,
    [client.tenantId]
  );
  return rows.map((r) => ({
    assignmentId: r.assignment_id, employeeId: r.employee_id, monthlyCtc: Number(r.monthly_ctc),
    structureName: r.structure_name, componentId: r.component_id, code: r.code, name: r.comp_name,
    category: r.category, fullAmount: Number(r.calculated_amount), isProRata: r.is_pro_rata, displayOrder: r.display_order,
  }));
}
