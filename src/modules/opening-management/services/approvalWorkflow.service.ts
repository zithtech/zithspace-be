// src/modules/opening-management/services/approvalWorkflow.service.ts
//
// Business logic for the tenant-level approval templates.
//
// A template is CONFIG only. Openings already in flight hold their own snapshot
// of the chain (see openingApproval.repo), so editing or deleting a workflow
// never rewrites a live approval — but we still refuse to delete one with
// pending work against it, because the audit trail should keep pointing at a
// row that exists.

import { TenantClient, withTenant } from '../db/pool';
import * as repo from '../repositories/approvalWorkflow.repo';
import {
  Actor,
  ApprovalWorkflowDetail,
  ApprovalWorkflowListItem,
  OpeningError,
} from '../types';
import { CreateWorkflowInput, UpdateWorkflowInput, WorkflowStepInput } from '../validators/approval.validator';

const UNIQUE_VIOLATION = '23505';

/** Referenced roles and users must belong to the tenant. */
async function validateStepReferences(
  client: TenantClient,
  steps: WorkflowStepInput[]
): Promise<void> {
  const roleIds = [
    ...new Set(steps.filter((s) => s.approverType === 'role').map((s) => s.roleId as string)),
  ];
  if (roleIds.length > 0) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM roles WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [client.tenantId, roleIds]
    );
    const found = new Set(rows.map((r) => r.id));
    const missing = roleIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw OpeningError.badRequest(`Role(s) not found for this tenant: ${missing.join(', ')}`);
    }
  }

  const userIds = [
    ...new Set(
      steps
        .flatMap((s) => [
          s.approverType === 'specific_user' ? s.specificUserId : null,
          s.fallbackUserId ?? null,
        ])
        .filter((id): id is string => !!id)
    ),
  ];
  if (userIds.length > 0) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [client.tenantId, userIds]
    );
    const found = new Set(rows.map((r) => r.id));
    const missing = userIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw OpeningError.badRequest(`User(s) not found for this tenant: ${missing.join(', ')}`);
    }
  }
}

function toStepData(steps: WorkflowStepInput[]): repo.StepData[] {
  return steps.map((s) => ({
    stepName: s.stepName,
    approverType: s.approverType,
    roleId: s.roleId ?? null,
    specificUserId: s.specificUserId ?? null,
    fallbackUserId: s.fallbackUserId ?? null,
    isOptional: s.isOptional ?? false,
    slaHours: s.slaHours ?? null,
  }));
}

async function loadDetail(
  client: TenantClient,
  workflowId: string
): Promise<ApprovalWorkflowDetail> {
  const workflow = await repo.findWorkflowById(client, workflowId);
  if (!workflow) throw OpeningError.notFound('Approval workflow');
  const steps = await repo.findSteps(client, workflowId);
  return { ...workflow, steps };
}

function rethrowDuplicateName(err: any): never {
  if (err?.code === UNIQUE_VIOLATION && err?.constraint === 'uq_om_approval_workflows_tenant_name') {
    throw OpeningError.conflict('An approval workflow with this name already exists');
  }
  throw err;
}

export async function createWorkflow(
  actor: Actor,
  input: CreateWorkflowInput
): Promise<ApprovalWorkflowDetail> {
  return withTenant(actor.tenantId, async (client) => {
    try {
      await validateStepReferences(client, input.steps);

      // Only one default may exist; setting a new one demotes the old.
      if (input.isDefault) await repo.clearDefault(client);

      const workflow = await repo.insertWorkflow(
        client,
        {
          name: input.name,
          description: input.description ?? null,
          isActive: input.isActive ?? true,
          isDefault: input.isDefault ?? false,
        },
        actor.userId
      );
      await repo.replaceSteps(client, workflow.id, toStepData(input.steps));
      return loadDetail(client, workflow.id);
    } catch (err) {
      return rethrowDuplicateName(err);
    }
  });
}

export async function listWorkflows(
  actor: Actor,
  includeInactive: boolean
): Promise<ApprovalWorkflowListItem[]> {
  return withTenant(actor.tenantId, (client) => repo.listWorkflows(client, includeInactive));
}

export async function getWorkflow(actor: Actor, id: string): Promise<ApprovalWorkflowDetail> {
  return withTenant(actor.tenantId, (client) => loadDetail(client, id));
}

export async function updateWorkflow(
  actor: Actor,
  id: string,
  input: UpdateWorkflowInput
): Promise<ApprovalWorkflowDetail> {
  return withTenant(actor.tenantId, async (client) => {
    try {
      const existing = await repo.findWorkflowById(client, id);
      if (!existing) throw OpeningError.notFound('Approval workflow');

      if (input.steps) await validateStepReferences(client, input.steps);
      if (input.isDefault) await repo.clearDefault(client, id);

      const updated = await repo.updateWorkflowHeader(
        client,
        id,
        {
          name: input.name,
          description: input.description,
          isActive: input.isActive,
          isDefault: input.isDefault,
        },
        actor.userId
      );
      if (!updated) throw OpeningError.notFound('Approval workflow');

      if (input.steps) await repo.replaceSteps(client, id, toStepData(input.steps));
      return loadDetail(client, id);
    } catch (err) {
      return rethrowDuplicateName(err);
    }
  });
}

export async function deleteWorkflow(actor: Actor, id: string): Promise<void> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.hasInFlightApprovals(client, id)) {
      throw OpeningError.conflict(
        'This workflow has openings awaiting approval — decide or withdraw them first'
      );
    }
    const ok = await repo.softDeleteWorkflow(client, id, actor.userId);
    if (!ok) throw OpeningError.notFound('Approval workflow');
  });
}
