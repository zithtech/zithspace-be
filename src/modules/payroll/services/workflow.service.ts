// src/modules/payroll/services/workflow.service.ts
//
// Business logic for approval workflows. Header + steps are written atomically;
// the single-default invariant is enforced as for pay schedules.

import { withTenant, TenantClient } from '../db/pool';
import * as repo from '../repositories/workflow.repo';
import { Actor, ApprovalWorkflowDetail, ApprovalWorkflowListItem, PayrollError } from '../types';
import { CreateWorkflowInput, UpdateWorkflowInput } from '../validators/workflow.validator';

async function buildDetail(client: TenantClient, wf: Awaited<ReturnType<typeof repo.findWorkflowById>>): Promise<ApprovalWorkflowDetail> {
  const w = wf!;
  return { ...w, steps: await repo.findSteps(client, w.id) };
}

function toStepInputs(input: CreateWorkflowInput): repo.StepInput[] {
  // Order is the array position (1-based); the UI controls ordering.
  return input.steps.map((s, i) => ({
    stepOrder: i + 1,
    approverType: s.approverType,
    roleId: s.roleId ?? null,
    specificUserId: s.specificUserId ?? null,
    fallbackUserId: s.fallbackUserId ?? null,
  }));
}

export async function createWorkflow(actor: Actor, input: CreateWorkflowInput): Promise<ApprovalWorkflowDetail> {
  return withTenant(actor.tenantId, async (client) => {
    if (input.isDefault) await repo.clearDefault(client);
    const wf = await repo.insertWorkflow(client, {
      name: input.name, description: input.description ?? null, isActive: input.isActive, isDefault: input.isDefault,
    }, actor.userId);
    await repo.replaceSteps(client, wf.id, toStepInputs(input));
    return buildDetail(client, wf);
  });
}

export async function updateWorkflow(actor: Actor, id: string, input: UpdateWorkflowInput): Promise<ApprovalWorkflowDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const existing = await repo.findWorkflowById(client, id);
    if (!existing) throw PayrollError.notFound('Approval workflow');
    if (input.isDefault) await repo.clearDefault(client, id);
    const updated = await repo.updateWorkflowHeader(client, id, {
      name: input.name, description: input.description ?? null, isActive: input.isActive, isDefault: input.isDefault,
    }, actor.userId);
    if (!updated) throw PayrollError.notFound('Approval workflow');
    await repo.replaceSteps(client, id, toStepInputs(input));
    return buildDetail(client, updated);
  });
}

export async function listWorkflows(
  actor: Actor,
  opts: { includeInactive?: boolean; page?: number; limit?: number; search?: string } = {}
): Promise<{ data: ApprovalWorkflowListItem[]; total: number }> {
  return withTenant(actor.tenantId, (client) => repo.listWorkflows(client, opts));
}

export async function getWorkflow(actor: Actor, id: string): Promise<ApprovalWorkflowDetail> {
  return withTenant(actor.tenantId, async (client) => {
    const wf = await repo.findWorkflowById(client, id);
    if (!wf) throw PayrollError.notFound('Approval workflow');
    return buildDetail(client, wf);
  });
}

export async function deleteWorkflow(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    const ok = await repo.softDeleteWorkflow(client, id, actor.userId);
    if (!ok) throw PayrollError.notFound('Approval workflow');
  });
}
