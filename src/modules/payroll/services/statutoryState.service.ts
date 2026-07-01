// src/modules/payroll/services/statutoryState.service.ts
//
// Business logic for Professional Tax (state + slabs) and LWF (per state).
// PT writes header + slabs atomically (replaceSlabs pattern).

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/statutoryState.repo';
import { Actor, LwfState, PtStateDetail, PtStateListItem, PayrollError } from '../types';
import {
  CreateLwfStateInput,
  CreatePtStateInput,
  UpdateLwfStateInput,
  UpdatePtStateInput,
} from '../validators/statutoryState.validator';

// ── Professional Tax ─────────────────────────────────────────────────────────
async function buildPtDetail(client: TenantClient, state: Awaited<ReturnType<typeof repo.findPtStateById>>): Promise<PtStateDetail> {
  const s = state!;
  return { ...s, slabs: await repo.findPtSlabs(client, s.id) };
}

function toSlabInputs(input: CreatePtStateInput): repo.PtSlabInput[] {
  return [...input.slabs]
    .sort((a, b) => a.fromAmount - b.fromAmount)
    .map((s, i) => ({
      fromAmount: s.fromAmount,
      toAmount: s.toAmount ?? null,
      monthlyAmount: s.monthlyAmount,
      displayOrder: s.displayOrder ?? i,
    }));
}

export async function createPtState(actor: Actor, input: CreatePtStateInput): Promise<PtStateDetail> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.ptStateExistsByName(client, input.state)) {
      throw PayrollError.conflict(`Professional Tax for "${input.state}" already exists`);
    }
    const state = await repo.insertPtState(client, input.state, input.isActive, actor.userId);
    await repo.replacePtSlabs(client, state.id, toSlabInputs(input));
    return buildPtDetail(client, state);
  });
}

export async function updatePtState(actor: Actor, id: string, input: UpdatePtStateInput): Promise<PtStateDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPtStateById(client, id);
    if (!existing) throw PayrollError.notFound('Professional Tax state');
    if (await repo.ptStateExistsByName(client, input.state, id)) {
      throw PayrollError.conflict(`Professional Tax for "${input.state}" already exists`);
    }
    const updated = await repo.updatePtStateHeader(client, id, input.state, input.isActive, actor.userId);
    if (!updated) throw PayrollError.notFound('Professional Tax state');
    await repo.replacePtSlabs(client, id, toSlabInputs(input));
    return buildPtDetail(client, updated);
  });
}

export async function listPtStates(actor: Actor, includeInactive: boolean): Promise<PtStateListItem[]> {
  return withTenant(actor.tenantId, (client) => repo.listPtStates(client, includeInactive));
}

export async function getPtState(actor: Actor, id: string): Promise<PtStateDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const state = await repo.findPtStateById(client, id);
    if (!state) throw PayrollError.notFound('Professional Tax state');
    return buildPtDetail(client, state);
  });
}

export async function deletePtState(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDeletePtState(client, id, actor.userId);
    if (!ok) throw PayrollError.notFound('Professional Tax state');
  });
}

// ── LWF ──────────────────────────────────────────────────────────────────────
export async function createLwf(actor: Actor, input: CreateLwfStateInput): Promise<LwfState> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.lwfExistsByName(client, input.state)) {
      throw PayrollError.conflict(`LWF for "${input.state}" already exists`);
    }
    return repo.insertLwf(client, {
      state: input.state,
      employeeAmount: input.employeeAmount,
      employerAmount: input.employerAmount,
      frequency: input.frequency,
      isActive: input.isActive,
      createdBy: actor.userId,
    });
  });
}

export async function updateLwf(actor: Actor, id: string, input: UpdateLwfStateInput): Promise<LwfState> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findLwfById(client, id);
    if (!existing) throw PayrollError.notFound('LWF state');
    if (input.state && (await repo.lwfExistsByName(client, input.state, id))) {
      throw PayrollError.conflict(`LWF for "${input.state}" already exists`);
    }
    const updated = await repo.updateLwf(client, id, input, actor.userId);
    if (!updated) throw PayrollError.notFound('LWF state');
    return updated;
  });
}

export async function listLwf(actor: Actor, includeInactive: boolean): Promise<LwfState[]> {
  return withTenant(actor.tenantId, (client) => repo.listLwf(client, includeInactive));
}

export async function deleteLwf(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDeleteLwf(client, id, actor.userId);
    if (!ok) throw PayrollError.notFound('LWF state');
  });
}
