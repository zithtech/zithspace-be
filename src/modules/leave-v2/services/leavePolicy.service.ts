// src/modules/leave-v2/services/leavePolicy.service.ts
//
// Business logic for leave policies. Owns the transaction boundary: a policy's
// header + assignments + lines are always written atomically.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/leavePolicy.repo';
import { Actor, LeavePolicyDetail, LeavePolicyListItem, LeaveV2Error, TERM_MONTHS, TermCycle } from '../types';
import {
  CreateLeavePolicyInput,
  UpdateLeavePolicyInput,
} from '../validators/leavePolicy.validator';

// Derive each line's total-per-term from its accrual method + the policy term.
function buildLines(input: CreateLeavePolicyInput): repo.LineInput[] {
  const months = TERM_MONTHS[input.termCycle as TermCycle] ?? 12;
  return input.lines.map((l) => ({
    leaveTypeId: l.leaveTypeId,
    accrualMethod: l.accrualMethod,
    countPerPeriod: l.countPerPeriod,
    allocation: l.accrualMethod === 'monthly' ? l.countPerPeriod * months : l.countPerPeriod,
    carryForward: l.carryForward,
    carryForwardMax: l.carryForwardMax ?? null,
  }));
}

export async function createPolicy(
  actor: Actor,
  input: CreateLeavePolicyInput
): Promise<LeavePolicyDetail> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsByCode(client, input.code)) {
      throw LeaveV2Error.conflict(`A policy with code "${input.code}" already exists`);
    }
    const policy = await repo.insertPolicy(
      client,
      {
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        isActive: input.isActive,
        termCycle: input.termCycle,
        lopOnExhaustion: input.lopOnExhaustion,
      },
      actor.userId
    );
    await repo.replaceAssignments(client, policy.id, input.assignments as repo.AssignmentInput[]);
    await repo.replaceLines(client, policy.id, buildLines(input));

    return {
      ...policy,
      assignments: await repo.findAssignments(client, policy.id),
      lines: await repo.findLines(client, policy.id),
    };
  });
}

export async function updatePolicy(
  actor: Actor,
  id: string,
  input: UpdateLeavePolicyInput
): Promise<LeavePolicyDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPolicyById(client, id);
    if (!existing) throw LeaveV2Error.notFound('Leave policy');

    if (await repo.existsByCode(client, input.code, id)) {
      throw LeaveV2Error.conflict(`A policy with code "${input.code}" already exists`);
    }

    const updated = await repo.updatePolicyHeader(
      client,
      id,
      {
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        isActive: input.isActive,
        termCycle: input.termCycle,
        lopOnExhaustion: input.lopOnExhaustion,
      },
      actor.userId
    );
    if (!updated) throw LeaveV2Error.notFound('Leave policy');

    await repo.replaceAssignments(client, id, input.assignments as repo.AssignmentInput[]);
    await repo.replaceLines(client, id, buildLines(input));

    return {
      ...updated,
      assignments: await repo.findAssignments(client, id),
      lines: await repo.findLines(client, id),
    };
  });
}

export async function listPolicies(
  actor: Actor,
  opts: {
    includeInactive?: boolean;
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  return withTenant(actor.tenantId, async (client) => {
    const { data, total } = await repo.listPolicies(client, opts);
    
    // For stats, fetch everything (respecting includeInactive, but no other filters) to compute global stats
    const allData = (await repo.listPolicies(client, { includeInactive: true })).data;
    
    const stats = {
      total: allData.length,
      active: allData.filter((r) => r.isActive).length,
      allocations: allData.reduce((s, r) => s + r.lineCount, 0),
      targets: allData.reduce((s, r) => s + r.assignmentCount, 0),
    };
    
    return { data, total, stats };
  });
}

export async function getPolicy(actor: Actor, id: string): Promise<LeavePolicyDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const policy = await repo.findPolicyById(client, id);
    if (!policy) throw LeaveV2Error.notFound('Leave policy');
    return {
      ...policy,
      assignments: await repo.findAssignments(client, id),
      lines: await repo.findLines(client, id),
    };
  });
}

export async function deletePolicy(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDeletePolicy(client, id, actor.userId);
    if (!ok) throw LeaveV2Error.notFound('Leave policy');
  });
}
