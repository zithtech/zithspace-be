// src/modules/reimbursement-v2/services/policy.service.ts
//
// Business logic for reimbursement policies. Owns the transaction boundary: a
// policy's header + assignments + lines are always written atomically.

import { withTenant } from '../db/pool';
import * as repo from '../repositories/policy.repo';
import { Actor, ReimbursementPolicyDetail, ReimbursementPolicyListItem, ReimbursementV2Error } from '../types';
import { CreatePolicyInput, UpdatePolicyInput } from '../validators/policy.validator';

export async function createPolicy(
  actor: Actor,
  input: CreatePolicyInput
): Promise<ReimbursementPolicyDetail> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.existsByCode(client, input.code)) {
      throw ReimbursementV2Error.conflict(`A policy with code "${input.code}" already exists`);
    }
    const policy = await repo.insertPolicy(
      client,
      {
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        autoApproveBelow: input.autoApproveBelow ?? null,
        isActive: input.isActive,
      },
      actor.userId
    );
    await repo.replaceAssignments(client, policy.id, input.assignments as repo.AssignmentInput[]);
    await repo.replaceLines(client, policy.id, input.lines as repo.LineInput[]);

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
  input: UpdatePolicyInput
): Promise<ReimbursementPolicyDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findPolicyById(client, id);
    if (!existing) throw ReimbursementV2Error.notFound('Policy');

    if (await repo.existsByCode(client, input.code, id)) {
      throw ReimbursementV2Error.conflict(`A policy with code "${input.code}" already exists`);
    }

    const updated = await repo.updatePolicyHeader(
      client,
      id,
      {
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        autoApproveBelow: input.autoApproveBelow ?? null,
        isActive: input.isActive,
      },
      actor.userId
    );
    if (!updated) throw ReimbursementV2Error.notFound('Policy');

    await repo.replaceAssignments(client, id, input.assignments as repo.AssignmentInput[]);
    await repo.replaceLines(client, id, input.lines as repo.LineInput[]);

    return {
      ...updated,
      assignments: await repo.findAssignments(client, id),
      lines: await repo.findLines(client, id),
    };
  });
}

export async function listPolicies(
  actor: Actor,
  opts: { includeInactive?: boolean } = {}
): Promise<ReimbursementPolicyListItem[]> {
  return withTenant(actor.tenantId, (client) => repo.listPolicies(client, opts));
}

export async function getPolicy(actor: Actor, id: string): Promise<ReimbursementPolicyDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const policy = await repo.findPolicyById(client, id);
    if (!policy) throw ReimbursementV2Error.notFound('Policy');
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
    if (!ok) throw ReimbursementV2Error.notFound('Policy');
  });
}
