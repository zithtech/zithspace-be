// src/modules/payroll/services/assignment.service.ts
//
// Business logic for employee salary assignments. Assigning a structure to an
// employee resolves the structure's component rules against the employee's
// monthly CTC, then FREEZES the breakdown as a snapshot. Reassigning deactivates
// the previous active assignment (one active per employee).

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/assignment.repo';
import * as structureRepo from '../repositories/structure.repo';
import { calcStructure, CalcLineInput } from './structureCalc';
import {
  Actor,
  EmployeeAssignmentComponent,
  EmployeeAssignmentDetail,
  EmployeeAssignmentListItem,
  PayrollError,
  StructureTotals,
} from '../types';
import { AssignInput, PreviewAssignInput } from '../validators/assignment.validator';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Resolve a structure's lines against a CTC → snapshot rows + totals.
async function resolveBreakdown(client: TenantClient, structureId: string, monthlyCtc: number) {
  const structure = await structureRepo.findStructureById(client, structureId);
  if (!structure) throw PayrollError.notFound('Salary structure');
  const lines = await structureRepo.findLines(client, structureId);
  if (lines.length === 0) throw PayrollError.badRequest('The selected structure has no components');

  const calcInput: CalcLineInput[] = lines.map((l) => ({
    key: l.componentId, code: l.code, category: l.category,
    calculationType: l.calculationType, percentageOf: l.percentageOf, value: l.value, displayOrder: l.displayOrder,
  }));
  const breakdown = calcStructure(monthlyCtc, calcInput);
  const amountByKey = new Map(breakdown.lines.map((l) => [l.key, l.calculatedAmount]));

  const snapshot: repo.SnapshotComponent[] = lines.map((l) => ({
    componentId: l.componentId, code: l.code, name: l.name, category: l.category,
    calculationType: l.calculationType, percentageOf: l.percentageOf, value: l.value,
    calculatedAmount: amountByKey.get(l.componentId) ?? 0, displayOrder: l.displayOrder,
  }));

  return { structure, snapshot, totals: breakdownTotals(breakdown) };
}

function breakdownTotals(b: ReturnType<typeof calcStructure>): StructureTotals {
  return {
    totalEarnings: b.totalEarnings, totalDeductions: b.totalDeductions, totalBenefits: b.totalBenefits,
    grossSalary: b.grossSalary, netSalary: b.netSalary, ctc: b.ctc, balanced: b.balanced, warning: b.warning,
  };
}

// Re-derive totals from a stored snapshot (categories drive the rollup).
function totalsFromSnapshot(components: EmployeeAssignmentComponent[]): StructureTotals {
  let earnings = 0, deductions = 0, benefits = 0;
  for (const c of components) {
    if (c.category === 'earning') earnings += c.calculatedAmount;
    else if (c.category === 'deduction') deductions += c.calculatedAmount;
    else benefits += c.calculatedAmount; // benefit + reimbursement
  }
  earnings = round2(earnings); deductions = round2(deductions); benefits = round2(benefits);
  return {
    totalEarnings: earnings, totalDeductions: deductions, totalBenefits: benefits,
    grossSalary: earnings, netSalary: round2(earnings - deductions), ctc: round2(earnings + benefits),
    balanced: true,
  };
}

export async function assign(actor: Actor, input: AssignInput): Promise<EmployeeAssignmentDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const { structure, snapshot } = await resolveBreakdown(client, input.structureId, input.monthlyCtc);

    await repo.deactivateActiveForEmployee(client, input.employeeId, actor.userId);
    const assignment = await repo.insertAssignment(client, {
      employeeId: input.employeeId,
      structureId: structure.id,
      monthlyCtc: round2(input.monthlyCtc),
      annualCtc: round2(input.monthlyCtc * 12),
      effectiveFrom: input.effectiveFrom,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    });
    await repo.insertComponents(client, assignment.id, snapshot);

    const components = await repo.findComponents(client, assignment.id);
    return {
      ...assignment,
      structureName: structure.name,
      structureCode: structure.code,
      components,
      totals: totalsFromSnapshot(components),
    };
  });
}

export async function listAssignments(actor: Actor): Promise<EmployeeAssignmentListItem[]> {
  return withTenant(actor.tenantId, (client) => repo.listActive(client));
}

export async function getHistory(actor: Actor, employeeId: string): Promise<EmployeeAssignmentListItem[]> {
  return withTenant(actor.tenantId, (client) => repo.findHistoryByEmployee(client, employeeId));
}

export async function getByEmployee(actor: Actor, employeeId: string): Promise<EmployeeAssignmentDetail | null> {
  return withTenant(actor.tenantId, async (client) => {
    const assignment = await repo.findActiveByEmployee(client, employeeId);
    if (!assignment) return null;
    const structure = await structureRepo.findStructureById(client, assignment.structureId);
    const components = await repo.findComponents(client, assignment.id);
    return {
      ...assignment,
      structureName: structure?.name ?? null,
      structureCode: structure?.code ?? null,
      components,
      totals: totalsFromSnapshot(components),
    };
  });
}

export async function previewAssignment(actor: Actor, input: PreviewAssignInput): Promise<{ components: repo.SnapshotComponent[]; totals: StructureTotals }> {
  return withTenant(actor.tenantId, async (client) => {
    const { snapshot, totals } = await resolveBreakdown(client, input.structureId, input.monthlyCtc);
    return { components: snapshot, totals };
  });
}

export async function revoke(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.revokeById(client, id, actor.userId);
    if (!ok) throw PayrollError.notFound('Assignment');
  });
}
