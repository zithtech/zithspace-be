// src/modules/opening-management/repositories/approvalWorkflow.repo.ts
//
// Raw-SQL data access for the approval CONFIG: om_approval_workflows and its
// ordered om_approval_workflow_steps. Runtime approvals live in
// openingApproval.repo.ts — editing a template here never touches an approval
// already in flight.

import { TenantClient } from '../db/pool';
import {
  ApprovalWorkflow,
  ApprovalWorkflowListItem,
  ApprovalWorkflowStep,
  ApproverType,
} from '../types';

const WF_COLS = `
  id, tenant_id, name, description, is_active, is_default,
  created_by, updated_by, created_at, updated_at
`;

function mapWorkflow(r: any): ApprovalWorkflow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    description: r.description,
    isActive: r.is_active,
    isDefault: r.is_default,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapStep(r: any): ApprovalWorkflowStep {
  return {
    id: r.id,
    workflowId: r.workflow_id,
    stepOrder: r.step_order,
    stepName: r.step_name,
    approverType: r.approver_type,
    roleId: r.role_id,
    roleName: r.role_name ?? null,
    specificUserId: r.specific_user_id,
    specificUserName: r.specific_user_name ?? null,
    fallbackUserId: r.fallback_user_id,
    fallbackUserName: r.fallback_user_name ?? null,
    isOptional: r.is_optional,
    slaHours: r.sla_hours,
  };
}

// ─── Header ─────────────────────────────────────────────────────────────────

export interface WorkflowHeaderData {
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
}

export async function insertWorkflow(
  client: TenantClient,
  data: WorkflowHeaderData,
  actorId: string
): Promise<ApprovalWorkflow> {
  const { rows } = await client.query(
    `INSERT INTO om_approval_workflows
       (tenant_id, name, description, is_active, is_default, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING ${WF_COLS}`,
    [client.tenantId, data.name, data.description, data.isActive, data.isDefault, actorId]
  );
  return mapWorkflow(rows[0]);
}

const HEADER_COLUMN_MAP: Record<string, string> = {
  name: 'name',
  description: 'description',
  isActive: 'is_active',
  isDefault: 'is_default',
};

export async function updateWorkflowHeader(
  client: TenantClient,
  id: string,
  data: Partial<WorkflowHeaderData>,
  actorId: string
): Promise<ApprovalWorkflow | null> {
  const sets: string[] = [];
  const params: any[] = [client.tenantId, id];

  for (const [key, column] of Object.entries(HEADER_COLUMN_MAP)) {
    if (key in data && (data as any)[key] !== undefined) {
      params.push((data as any)[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  params.push(actorId);
  sets.push(`updated_by = $${params.length}`);
  sets.push('updated_at = now()');

  const { rows } = await client.query(
    `UPDATE om_approval_workflows
        SET ${sets.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING ${WF_COLS}`,
    params
  );
  return rows[0] ? mapWorkflow(rows[0]) : null;
}

export async function findWorkflowById(
  client: TenantClient,
  id: string
): Promise<ApprovalWorkflow | null> {
  const { rows } = await client.query(
    `SELECT ${WF_COLS} FROM om_approval_workflows
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id]
  );
  return rows[0] ? mapWorkflow(rows[0]) : null;
}

export async function listWorkflows(
  client: TenantClient,
  includeInactive: boolean
): Promise<ApprovalWorkflowListItem[]> {
  const conditions = ['w.tenant_id = $1', 'w.deleted_at IS NULL'];
  if (!includeInactive) conditions.push('w.is_active = true');

  const { rows } = await client.query(
    `SELECT w.id, w.tenant_id, w.name, w.description, w.is_active, w.is_default,
            w.created_by, w.updated_by, w.created_at, w.updated_at,
            (SELECT count(*) FROM om_approval_workflow_steps s WHERE s.workflow_id = w.id) AS step_count
       FROM om_approval_workflows w
      WHERE ${conditions.join(' AND ')}
      ORDER BY w.is_default DESC, w.name ASC`,
    [client.tenantId]
  );
  return rows.map((r) => ({ ...mapWorkflow(r), stepCount: Number(r.step_count) }));
}

/** The workflow a submission uses when the caller does not name one. */
export async function findDefaultWorkflow(
  client: TenantClient
): Promise<ApprovalWorkflow | null> {
  const { rows } = await client.query(
    `SELECT ${WF_COLS} FROM om_approval_workflows
      WHERE tenant_id = $1 AND is_default = true AND is_active = true AND deleted_at IS NULL
      LIMIT 1`,
    [client.tenantId]
  );
  return rows[0] ? mapWorkflow(rows[0]) : null;
}

/** Clear the default flag everywhere (except `exceptId`) before setting a new one. */
export async function clearDefault(client: TenantClient, exceptId?: string): Promise<void> {
  const params: any[] = [client.tenantId];
  let sql = `UPDATE om_approval_workflows
                SET is_default = false, updated_at = now()
              WHERE tenant_id = $1 AND is_default = true AND deleted_at IS NULL`;
  if (exceptId) {
    params.push(exceptId);
    sql += ` AND id <> $2`;
  }
  await client.query(sql, params);
}

export async function softDeleteWorkflow(
  client: TenantClient,
  id: string,
  actorId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE om_approval_workflows
        SET deleted_at = now(), is_default = false, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Steps ──────────────────────────────────────────────────────────────────

export interface StepData {
  stepName: string;
  approverType: ApproverType;
  roleId: string | null;
  specificUserId: string | null;
  fallbackUserId: string | null;
  isOptional: boolean;
  slaHours: number | null;
}

export async function findSteps(
  client: TenantClient,
  workflowId: string
): Promise<ApprovalWorkflowStep[]> {
  const { rows } = await client.query(
    `SELECT s.id, s.workflow_id, s.step_order, s.step_name, s.approver_type,
            s.role_id, r.name AS role_name,
            s.specific_user_id, su.name AS specific_user_name,
            s.fallback_user_id, fu.name AS fallback_user_name,
            s.is_optional, s.sla_hours
       FROM om_approval_workflow_steps s
       LEFT JOIN roles r  ON r.id  = s.role_id
       LEFT JOIN users su ON su.id = s.specific_user_id
       LEFT JOIN users fu ON fu.id = s.fallback_user_id
      WHERE s.tenant_id = $1 AND s.workflow_id = $2
      ORDER BY s.step_order ASC`,
    [client.tenantId, workflowId]
  );
  return rows.map(mapStep);
}

/**
 * Replace the whole chain. Step order is the array index + 1, so the caller
 * expresses ordering by ordering the array — there is no separate field to keep
 * in sync.
 */
export async function replaceSteps(
  client: TenantClient,
  workflowId: string,
  steps: StepData[]
): Promise<void> {
  await client.query(
    `DELETE FROM om_approval_workflow_steps WHERE tenant_id = $1 AND workflow_id = $2`,
    [client.tenantId, workflowId]
  );
  if (steps.length === 0) return;

  await client.query(
    `INSERT INTO om_approval_workflow_steps
       (tenant_id, workflow_id, step_order, step_name, approver_type,
        role_id, specific_user_id, fallback_user_id, is_optional, sla_hours)
     SELECT $1, $2, x.step_order, x.step_name, x.approver_type,
            x.role_id::uuid, x.specific_user_id, x.fallback_user_id, x.is_optional, x.sla_hours
       FROM UNNEST(
              $3::int[], $4::text[], $5::text[], $6::text[],
              $7::text[], $8::text[], $9::boolean[], $10::int[]
            ) AS x(step_order, step_name, approver_type, role_id,
                   specific_user_id, fallback_user_id, is_optional, sla_hours)`,
    [
      client.tenantId,
      workflowId,
      steps.map((_, i) => i + 1),
      steps.map((s) => s.stepName),
      steps.map((s) => s.approverType),
      // Only the field that matches the approver type is persisted; the others
      // are nulled so a type change cannot leave a stale reference behind.
      steps.map((s) => (s.approverType === 'role' ? s.roleId : null)),
      steps.map((s) => (s.approverType === 'specific_user' ? s.specificUserId : null)),
      steps.map((s) => s.fallbackUserId),
      steps.map((s) => s.isOptional),
      steps.map((s) => s.slaHours),
    ]
  );
}

/** True when any opening is mid-approval against this workflow. */
export async function hasInFlightApprovals(
  client: TenantClient,
  workflowId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM om_opening_approvals
      WHERE tenant_id = $1 AND workflow_id = $2 AND status = 'pending'
      LIMIT 1`,
    [client.tenantId, workflowId]
  );
  return (rowCount ?? 0) > 0;
}
