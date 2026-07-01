// src/modules/payroll/services/structure.service.ts
//
// Business logic for Salary Structures. Owns the transaction boundary: a
// structure's header + component lines are always written atomically. Reads
// return the breakdown computed against the structure's reference monthly_ctc.

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/structure.repo';
import { calcStructure, CalcLineInput } from './structureCalc';
import {
  Actor,
  PayStructureDetail,
  PayStructureLine,
  PayStructureListItem,
  PayrollError,
  StructureTotals,
} from '../types';
import {
  CreateStructureInput,
  PreviewStructureInput,
  UpdateStructureInput,
} from '../validators/structure.validator';

// Assemble the full detail (lines + computed amounts + totals) for a structure.
async function buildDetail(client: TenantClient, structure: Awaited<ReturnType<typeof repo.findStructureById>>): Promise<PayStructureDetail> {
  const s = structure!;
  const rows = await repo.findLines(client, s.id);
  const calcInput: CalcLineInput[] = rows.map((r) => ({
    key: r.componentId,
    code: r.code,
    category: r.category,
    calculationType: r.calculationType,
    percentageOf: r.percentageOf,
    value: r.value,
    displayOrder: r.displayOrder,
  }));
  const breakdown = calcStructure(s.monthlyCtc, calcInput);
  const amountByKey = new Map(breakdown.lines.map((l) => [l.key, l.calculatedAmount]));

  const lines: PayStructureLine[] = rows.map((r) => ({
    id: r.id,
    structureId: r.structureId,
    componentId: r.componentId,
    code: r.code,
    name: r.name,
    category: r.category,
    calculationType: r.calculationType,
    percentageOf: r.percentageOf,
    value: r.value,
    displayOrder: r.displayOrder,
    calculatedAmount: amountByKey.get(r.componentId) ?? 0,
  }));

  const totals: StructureTotals = {
    totalEarnings: breakdown.totalEarnings,
    totalDeductions: breakdown.totalDeductions,
    totalBenefits: breakdown.totalBenefits,
    grossSalary: breakdown.grossSalary,
    netSalary: breakdown.netSalary,
    ctc: breakdown.ctc,
    balanced: breakdown.balanced,
    warning: breakdown.warning,
  };

  return { ...s, lines, totals };
}

// Verify every referenced component exists for this tenant.
async function assertComponentsExist(client: TenantClient, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    throw PayrollError.badRequest('A component cannot be added to a structure more than once');
  }
  const live = await repo.countLiveComponents(client, unique);
  if (live !== unique.length) {
    throw PayrollError.badRequest('One or more selected components no longer exist');
  }
}

function toLineInputs(input: CreateStructureInput): repo.StructureLineInput[] {
  return input.lines.map((l, i) => ({
    componentId: l.componentId,
    calculationType: l.calculationType,
    percentageOf: l.percentageOf ?? null,
    value: l.value,
    displayOrder: l.displayOrder ?? i,
  }));
}

export async function createStructure(actor: Actor, input: CreateStructureInput): Promise<PayStructureDetail> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsByCode(client, input.code)) {
      throw PayrollError.conflict(`A structure with code "${input.code}" already exists`);
    }
    await assertComponentsExist(client, input.lines.map((l) => l.componentId));

    const structure = await repo.insertStructure(
      client,
      {
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        monthlyCtc: input.monthlyCtc,
        isActive: input.isActive,
      },
      actor.userId
    );
    await repo.replaceLines(client, structure.id, toLineInputs(input));
    return buildDetail(client, structure);
  });
}

export async function updateStructure(
  actor: Actor,
  id: string,
  input: UpdateStructureInput
): Promise<PayStructureDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findStructureById(client, id);
    if (!existing) throw PayrollError.notFound('Salary structure');

    if (await repo.existsByCode(client, input.code, id)) {
      throw PayrollError.conflict(`A structure with code "${input.code}" already exists`);
    }
    await assertComponentsExist(client, input.lines.map((l) => l.componentId));

    const updated = await repo.updateStructureHeader(
      client,
      id,
      {
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        monthlyCtc: input.monthlyCtc,
        isActive: input.isActive,
      },
      actor.userId
    );
    if (!updated) throw PayrollError.notFound('Salary structure');

    await repo.replaceLines(client, id, toLineInputs(input));
    return buildDetail(client, updated);
  });
}

export async function listStructures(
  actor: Actor,
  opts: { includeInactive?: boolean } = {}
): Promise<PayStructureListItem[]> {
  return withTenant(actor.tenantId, (client) => repo.listStructures(client, opts));
}

export async function getStructure(actor: Actor, id: string): Promise<PayStructureDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const structure = await repo.findStructureById(client, id);
    if (!structure) throw PayrollError.notFound('Salary structure');
    return buildDetail(client, structure);
  });
}

export async function deleteStructure(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDeleteStructure(client, id, actor.userId);
    if (!ok) throw PayrollError.notFound('Salary structure');
  });
}

/** Compute a breakdown for unsaved edits (no persistence). */
export async function previewStructure(
  actor: Actor,
  input: PreviewStructureInput
): Promise<PayStructureDetail['totals'] & { lines: { componentId: string; calculatedAmount: number }[] }> {
  return withTenant(actor.tenantId, async (client) => {
    const ids = input.lines.map((l) => l.componentId);
    // Resolve component meta (code/category) for the referenced ids.
    const meta = await repo.findComponentsMeta(client, ids);
    const metaById = new Map(meta.map((m) => [m.id, m]));
    const calcInput: CalcLineInput[] = input.lines
      .filter((l) => metaById.has(l.componentId))
      .map((l, i) => {
        const m = metaById.get(l.componentId)!;
        return {
          key: l.componentId,
          code: m.code,
          category: m.category,
          calculationType: l.calculationType,
          percentageOf: l.percentageOf ?? null,
          value: l.value,
          displayOrder: l.displayOrder ?? i,
        };
      });
    const b = calcStructure(input.monthlyCtc, calcInput);
    return {
      totalEarnings: b.totalEarnings,
      totalDeductions: b.totalDeductions,
      totalBenefits: b.totalBenefits,
      grossSalary: b.grossSalary,
      netSalary: b.netSalary,
      ctc: b.ctc,
      balanced: b.balanced,
      warning: b.warning,
      lines: b.lines.map((l) => ({ componentId: l.key, calculatedAmount: l.calculatedAmount })),
    };
  });
}
