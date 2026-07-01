// src/modules/payroll/services/reports.service.ts
//
// Read-only payroll reports over a finalized/draft run's items. The Salary
// Register is a per-employee matrix: dynamic earning + deduction columns (the
// union of components across the run) with gross / deductions / net, plus a
// statutory deductions summary (column totals of the deduction side).

import { withTenant } from '../db/pool';
import * as runRepo from '../repositories/payRun.repo';
import * as payslipRepo from '../repositories/payslip.repo';
import { Actor, PayrollError } from '../types';

export interface RegisterColumn {
  code: string;
  name: string;
}

export interface RegisterRow {
  employeeId: string;
  name: string;
  designation: string | null;
  paidDays: number;
  lopDays: number;
  amounts: Record<string, number>; // keyed by component code
  gross: number;
  totalDeductions: number;
  net: number;
}

export interface SalaryRegister {
  run: {
    id: string;
    periodLabel: string;
    status: string;
    totalDays: number;
    employeeCount: number;
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
  };
  earningCols: RegisterColumn[];
  deductionCols: RegisterColumn[];
  rows: RegisterRow[];
  statutory: { code: string; name: string; total: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getRegister(actor: Actor, runId: string): Promise<SalaryRegister> {
  return withTenant(actor.tenantId, async (client) => {
    const run = await runRepo.findRunById(client, runId);
    if (!run) throw PayrollError.notFound('Pay run');

    const items = await runRepo.findItems(client, runId);
    const empInfo = await payslipRepo.findEmployeeInfo(client, items.map((i) => i.employeeId));
    const empMap = new Map(empInfo.map((e) => [e.id, e]));

    // Union of component columns (first occurrence wins; ordered by displayOrder).
    const earnMap = new Map<string, RegisterColumn & { order: number }>();
    const dedMap = new Map<string, RegisterColumn & { order: number }>();
    for (const it of items) {
      for (const c of it.components) {
        if (c.category === 'earning' && !earnMap.has(c.code)) earnMap.set(c.code, { code: c.code, name: c.name, order: 0 });
        else if (c.category === 'deduction' && !dedMap.has(c.code)) dedMap.set(c.code, { code: c.code, name: c.name, order: 0 });
      }
    }
    const byName = (a: RegisterColumn, b: RegisterColumn) => a.name.localeCompare(b.name);
    const earningCols = [...earnMap.values()].map((c) => ({ code: c.code, name: c.name })).sort(byName);
    const deductionCols = [...dedMap.values()].map((c) => ({ code: c.code, name: c.name })).sort(byName);

    const rows: RegisterRow[] = items.map((it) => {
      const amounts: Record<string, number> = {};
      for (const c of it.components) {
        if (c.category === 'earning' || c.category === 'deduction') amounts[c.code] = c.amount;
      }
      const emp = empMap.get(it.employeeId);
      return {
        employeeId: it.employeeId,
        name: emp?.name ?? 'Employee',
        designation: emp?.designation ?? null,
        paidDays: it.paidDays,
        lopDays: it.lopDays,
        amounts,
        gross: it.gross,
        totalDeductions: it.totalDeductions,
        net: it.net,
      };
    });

    const statutory = deductionCols.map((col) => ({
      code: col.code,
      name: col.name,
      total: round2(rows.reduce((s, r) => s + (r.amounts[col.code] ?? 0), 0)),
    }));

    return {
      run: {
        id: run.id, periodLabel: run.periodLabel, status: run.status, totalDays: run.totalDays,
        employeeCount: run.employeeCount, totalGross: run.totalGross, totalDeductions: run.totalDeductions, totalNet: run.totalNet,
      },
      earningCols,
      deductionCols,
      rows,
      statutory,
    };
  });
}
