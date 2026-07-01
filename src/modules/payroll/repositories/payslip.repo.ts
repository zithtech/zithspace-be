// src/modules/payroll/repositories/payslip.repo.ts
//
// Raw-SQL data access for pay_payslips, plus small read helpers for employee
// display info (users/positions) and the company name (tenants) used to render
// the payslip header. Every query filters tenant_id explicitly.

import { TenantClient } from '../db/pool';
import { EmployeeBasicInfo, PayPayslip } from '../types';

const COLS = `
  id, tenant_id, run_id, employee_id, month, year, period_label,
  gross, total_deductions, net, lop_days, file_url, file_key, status,
  generated_by, generated_at
`;

function mapRow(r: any): PayPayslip {
  return {
    id: r.id, tenantId: r.tenant_id, runId: r.run_id, employeeId: r.employee_id,
    month: r.month, year: r.year, periodLabel: r.period_label,
    gross: Number(r.gross), totalDeductions: Number(r.total_deductions), net: Number(r.net), lopDays: Number(r.lop_days),
    fileUrl: r.file_url, fileKey: r.file_key, status: r.status, generatedBy: r.generated_by, generatedAt: r.generated_at,
  };
}

export interface UpsertPayslipData {
  runId: string;
  employeeId: string;
  month: number;
  year: number;
  periodLabel: string;
  gross: number;
  totalDeductions: number;
  net: number;
  lopDays: number;
  fileUrl: string;
  fileKey: string | null;
  generatedBy: string;
}

export async function upsertPayslip(client: TenantClient, d: UpsertPayslipData): Promise<PayPayslip> {
  const { rows } = await client.query(
    `INSERT INTO pay_payslips
       (tenant_id, run_id, employee_id, month, year, period_label, gross, total_deductions, net, lop_days, file_url, file_key, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (run_id, employee_id) DO UPDATE SET
       gross = EXCLUDED.gross, total_deductions = EXCLUDED.total_deductions, net = EXCLUDED.net,
       lop_days = EXCLUDED.lop_days, file_url = EXCLUDED.file_url, file_key = EXCLUDED.file_key,
       status = 'generated', generated_by = EXCLUDED.generated_by, generated_at = now()
     RETURNING ${COLS}`,
    [
      client.tenantId, d.runId, d.employeeId, d.month, d.year, d.periodLabel,
      d.gross, d.totalDeductions, d.net, d.lopDays, d.fileUrl, d.fileKey, d.generatedBy,
    ]
  );
  return mapRow(rows[0]);
}

export async function findByRun(client: TenantClient, runId: string): Promise<PayPayslip[]> {
  const { rows } = await client.query(
    `SELECT ${COLS} FROM pay_payslips WHERE tenant_id = $1 AND run_id = $2 ORDER BY generated_at DESC`,
    [client.tenantId, runId]
  );
  return rows.map(mapRow);
}

export async function findForEmployee(client: TenantClient, employeeId: string): Promise<PayPayslip[]> {
  const { rows } = await client.query(
    `SELECT ${COLS} FROM pay_payslips WHERE tenant_id = $1 AND employee_id = $2 ORDER BY year DESC, month DESC`,
    [client.tenantId, employeeId]
  );
  return rows.map(mapRow);
}

// Employee display info (name / email / designation / code / joining date) for
// payslip headers. NOTE: the Prisma-managed tables key on TEXT ids (not uuid),
// so the id array is cast to text[] and tenant_id compared as text. Employee
// code (from employees) and joining date (earliest from employee_timelines) are
// best-effort — null when absent.
export async function findEmployeeInfo(client: TenantClient, ids: string[]): Promise<EmployeeBasicInfo[]> {
  if (ids.length === 0) return [];
  const { rows } = await client.query(
    `SELECT u.id, u.name, u.work_email AS email, pos.title AS designation,
            e.employee_code,
            COALESCE(dept.name, u.department) AS department,
            gr.name AS grade,
            (SELECT wd.work_location FROM employee_work_details wd
               WHERE wd.employee_id = u.employee_id AND wd.work_location IS NOT NULL
               ORDER BY wd.updated_at DESC NULLS LAST LIMIT 1) AS work_location,
            to_char((SELECT MIN(et.joining_date) FROM employee_timelines et WHERE et.employee_id = u.employee_id), 'YYYY-MM-DD') AS joining_date
       FROM users u
       LEFT JOIN positions pos ON pos.id = u.position_id AND pos.tenant_id = u.tenant_id
       LEFT JOIN employees e ON e.id = u.employee_id AND e.tenant_id = u.tenant_id
       LEFT JOIN departments dept ON dept.id = pos.department_id AND dept.tenant_id = pos.tenant_id
       LEFT JOIN grades gr ON gr.id = pos.grade_id AND gr.tenant_id = pos.tenant_id
      WHERE u.tenant_id = $1 AND u.id = ANY($2::text[])`,
    [client.tenantId, ids]
  );
  return rows.map((r) => ({
    id: r.id, name: r.name ?? 'Employee', email: r.email ?? null, designation: r.designation ?? null,
    employeeCode: r.employee_code ?? null, department: r.department ?? null, grade: r.grade ?? null,
    location: r.work_location ?? null, dateOfJoining: r.joining_date ?? null,
  }));
}

// Year-to-date totals per component code for an employee, summed across the
// tenant's finalized/paid runs whose (year,month) falls in the financial year
// window [fromKey, toKey], where key = year*12 + month. Expands the components
// jsonb array. Returns a code → ytd-amount map.
export async function findYtdByCode(
  client: TenantClient,
  employeeId: string,
  fromKey: number,
  toKey: number
): Promise<Record<string, number>> {
  const { rows } = await client.query(
    `SELECT elem->>'code' AS code, SUM((elem->>'amount')::numeric) AS ytd
       FROM pay_run_items i
       JOIN pay_runs r ON r.id = i.run_id AND r.tenant_id = i.tenant_id
       CROSS JOIN LATERAL jsonb_array_elements(i.components) elem
      WHERE i.tenant_id = $1 AND i.employee_id = $2
        AND r.status IN ('finalized', 'paid')
        AND (r.year * 12 + r.month) BETWEEN $3 AND $4
      GROUP BY elem->>'code'`,
    [client.tenantId, employeeId, fromKey, toKey]
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.code] = Math.round(Number(r.ytd) * 100) / 100;
  return out;
}

// Best-effort company name for the payslip header (tenant display name).
export async function findCompanyName(client: TenantClient): Promise<string> {
  const { rows } = await client.query(`SELECT name FROM tenants WHERE id = $1`, [client.tenantId]);
  return (rows[0]?.name as string) || 'Company';
}
